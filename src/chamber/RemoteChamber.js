import EventSet from '../util/EventSet';
import { encodeUTF8, decodeUTF8 } from '../util/utf8';
import JoinedBuffer from '../util/JoinedBuffer';

// 0 gives best upload speed for fragmented files,
// but we reduce the workload a little for not much slowdown:
const WS_BUFFER_CHECK_INTERVAL = 20;

const NEWLINE = '\n'.charCodeAt(0);
const NEWLINE_BUF = Uint8Array.of(NEWLINE);
const COLON = ':'.charCodeAt(0);
const HEADMARK_ID = 'I'.charCodeAt(0);
const HEADMARK_HI = 'H'.charCodeAt(0);
const HEADMARK_BYE = 'B'.charCodeAt(0);
const HEADMARK_FROM = 'F'.charCodeAt(0);
const HEADMARK_TRUNCATED = 'X'.charCodeAt(0);

function readString(data, from, to) {
	return decodeUTF8(data.subarray(from, to));
}

function makeHeaders(myID, {
	recipients = [],
	one = false,
	andSelf = false,
} = {}) {
	const headers = [];
	if (recipients.length > 0) {
		headers.push(...recipients.map((r) => `T${r}`));
		if (one) {
			throw new Error('invalid recipient list');
		}
		if (andSelf && myID) {
			headers.push(`T${myID}`);
		}
	} else if (one) {
		headers.push('T*');
		if (andSelf && myID) {
			headers.push(`T${myID}`);
		}
	} else if (andSelf) {
		headers.push('T**');
	}
	return encodeUTF8(headers.join(':'));
}

function parseHeaders(data) {
	let offset = 0;
	let sender = null;
	let myID = null;
	let wasTruncated = false;
	const hi = new Set();
	const bye = new Set();
	const unknownHeaders = [];
	while (offset < data.length) {
		let q = data.indexOf(COLON, offset);
		if (q === -1) {
			q = data.length;
		}
		switch (data[offset]) {
			case HEADMARK_ID:
				myID = readString(data, offset + 1, q);
				break;
			case HEADMARK_HI: {
				const name = readString(data, offset + 1, q);
				hi.add(name);
				bye.delete(name);
				break;
			}
			case HEADMARK_BYE: {
				const name = readString(data, offset + 1, q);
				bye.add(name);
				hi.delete(name);
				break;
			}
			case HEADMARK_FROM:
				sender = readString(data, offset + 1, q);
				break;
			case HEADMARK_TRUNCATED:
				wasTruncated = true;
				break;
			default:
				unknownHeaders.push(readString(data, offset, q));
		}
		offset = q + 1;
	}

	return { wasTruncated, hi, bye, myID, sender, unknownHeaders };
}

export default class RemoteChamber extends EventTarget {
	constructor() {
		super();

		this._currentUrl = '';
		this._ws = null;
		this._myID = null;
		this._participants = new EventSet();
		this._allSentResolvers = [];
		this._polling = null;

		this._message = this._message.bind(this);
		this._close = this._close.bind(this);
		this._error = this._error.bind(this);
		this._checkSent = this._checkSent.bind(this);
	}

	_message(e) {
		const data = (typeof e.data === 'string') ? encodeUTF8(e.data) : new Uint8Array(e.data);
		let p = data.indexOf(NEWLINE);
		if (p === -1) {
			p = data.length;
		}
		const info = parseHeaders(data.subarray(0, p));
		if (info.wasTruncated) {
			this.dispatchEvent(new CustomEvent('previousMessageTruncated'));
		}
		this._participants.addAll(info.hi);
		this._participants.deleteAll(info.bye);
		if (info.myID) {
			this._myID = info.myID;
			this.dispatchEvent(new CustomEvent('open', { detail: {
				id: this._myID,
				participants: this._participants,
			} }));
		}
		if (data.length >= p + 1 || info.unknownHeaders.length > 0) {
			this.dispatchEvent(new CustomEvent('message', { detail: {
				senderID: info.sender,
				data: data.subarray(p + 1),
				unknownHeaders: info.unknownHeaders,
			} }));
		}
	}

	_close(e) {
		this._myID = null;
		this._participants.clear();
		this._resolveCurrent(false);
		this.dispatchEvent(new CloseEvent('close', e));
	}

	_error(e) {
		this._myID = null;
		this._resolveCurrent(false);
		this.dispatchEvent(new Event('error', e));
	}

	get isConnected() {
		return Boolean(this._myID);
	}

	get myID() {
		return this._myID;
	}

	get participants() {
		return this._participants;
	}

	get currentUrl() {
		return this._currentUrl;
	}

	send(msg, recipients) {
		if (!this._myID) {
			return Promise.resolve(false);
		}
		if (this._polling) {
			this._checkSent();
		}
		const headers = makeHeaders(this._myID, recipients);
		this._ws.send(new JoinedBuffer(headers, NEWLINE_BUF, msg).toBytes());

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
		console.log('checking', this._ws.bufferedAmount);
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
			this._ws.removeEventListener('message', this._message);
			this._ws.removeEventListener('close', this._close);
			this._ws.removeEventListener('error', this._error);
			this._ws.close();
			this._close();
		}
		this._myID = null;

		try {
			this._ws = new WebSocket(this._currentUrl, ['echo']);
			this._ws.binaryType = 'arraybuffer';
			this._ws.addEventListener('message', this._message);
			this._ws.addEventListener('close', this._close);
			this._ws.addEventListener('error', this._error);
		} catch (e) {
			this._error(e);
		}
	}

	setUrl(url) {
		if (this._currentUrl !== url || !this._myID) {
			this._currentUrl = url;
			this.reconnect();
		}
	}
}
