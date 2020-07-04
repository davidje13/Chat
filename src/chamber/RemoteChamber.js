import EventSet from '../util/EventSet';
import { encodeUTF8 } from '../util/utf8';
import JoinedBuffer from '../util/JoinedBuffer';

// 0 gives best upload speed for fragmented files,
// but we reduce the workload a little for not much slowdown:
const WS_BUFFER_CHECK_INTERVAL = 20;

const REMOTE_PARTICIPANT_ID = 'remote';
const REMOTE_PARTICIPANTS = new EventSet();
REMOTE_PARTICIPANTS.add(REMOTE_PARTICIPANT_ID);

export default class RemoteChamber extends EventTarget {
	constructor() {
		super();

		this._currentUrl = '';
		this._ws = null;
		this._connected = false;
		this._allSentResolvers = [];
		this._polling = null;

		this._open = this._open.bind(this);
		this._message = this._message.bind(this);
		this._close = this._close.bind(this);
		this._error = this._error.bind(this);
		this._checkSent = this._checkSent.bind(this);
	}

	_open() {
		this._connected = true;
		this.dispatchEvent(new CustomEvent('open'));
	}

	_message(e) {
		const data = (typeof e.data === 'string') ? encodeUTF8(e.data) : new Uint8Array(e.data);
		this.dispatchEvent(new CustomEvent('message', { detail: {
			senderID: REMOTE_PARTICIPANT_ID,
			data,
		} }));
	}

	_close(e) {
		this._connected = false;
		this._resolveCurrent(false);
		this.dispatchEvent(new CloseEvent('close', e));
	}

	_error(e) {
		this._connected = false;
		this._resolveCurrent(false);
		this.dispatchEvent(new Event('error', e));
	}

	get isConnected() {
		return this._connected;
	}

	get myID() {
		return 'me';
	}

	get participants() {
		return REMOTE_PARTICIPANTS;
	}

	get currentUrl() {
		return this._currentUrl;
	}

	send(msg) {
		if (!this._connected) {
			return Promise.resolve(false);
		}
		if (this._polling) {
			this._checkSent();
		}
		this._ws.send(new JoinedBuffer(msg).toBytes());

		// WebSockets don't provide a native event to notify when they have been sent,
		// so we have to poll instead:
		const promise = new Promise((resolve) => this._allSentResolvers.push(resolve));
		if (!this._polling) {
			// no point checking immediately; will not have sent until at least the next MACROtask
			this._polling = window.setTimeout(this._checkSent, 0);
		}
		return promise;
	}

	_checkSent() {
		if (!this._ws.bufferedAmount) {
			this._resolveCurrent(true);
		} else {
			window.clearTimeout(this._polling);
			this._polling = window.setTimeout(this._checkSent, WS_BUFFER_CHECK_INTERVAL);
		}
	}

	_resolveCurrent(state) {
		const resolvers = this._allSentResolvers;
		this._allSentResolvers = [];
		window.clearTimeout(this._polling);
		this._polling = null;
		resolvers.forEach((resolve) => resolve(state));
	}

	reconnect() {
		if (this._ws !== null) {
			this._ws.removeEventListener('open', this._open);
			this._ws.removeEventListener('message', this._message);
			this._ws.removeEventListener('close', this._close);
			this._ws.removeEventListener('error', this._error);
			this._ws.close();
			this._close();
		}

		try {
			this._ws = new WebSocket(this._currentUrl, ['echo']);
			this._ws.binaryType = 'arraybuffer';
			this._ws.addEventListener('open', this._open);
			this._ws.addEventListener('message', this._message);
			this._ws.addEventListener('close', this._close);
			this._ws.addEventListener('error', this._error);
		} catch (e) {
			this._error(e);
		}
	}

	setUrl(url) {
		if (this._currentUrl !== url || !this._connected) {
			this._currentUrl = url;
			this.reconnect();
		}
	}
}
