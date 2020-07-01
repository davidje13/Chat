import EventSet from '../util/EventSet';
import { join, encodeUTF8, readString } from '../util/buffer';

const NEWLINE = '\n'.charCodeAt(0);
const NEWLINE_BUF = Uint8Array.of(NEWLINE);
const COLON = ':'.charCodeAt(0);
const HEADMARK_ID = 'I'.charCodeAt(0);
const HEADMARK_HI = 'H'.charCodeAt(0);
const HEADMARK_BYE = 'B'.charCodeAt(0);
const HEADMARK_FROM = 'F'.charCodeAt(0);
const HEADMARK_TRUNCATED = 'X'.charCodeAt(0);

function asUint8Array(v) {
	if (typeof v === 'string') {
		return encodeUTF8(v);
	}
	return new Uint8Array(v);
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
		this._ready = false;
		this._participants = new EventSet();

		this._open = this._open.bind(this);
		this._message = this._message.bind(this);
		this._close = this._close.bind(this);
		this._error = this._error.bind(this);
	}

	_open() {
		this._ready = true;
	}

	_message(e) {
		const data = asUint8Array(e.data);
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
				myID: this._myID,
				data: data.subarray(p + 1),
				unknownHeaders: info.unknownHeaders,
			} }));
		}
	}

	_close(e) {
		this._ready = false;
		this._myID = null;
		this._participants.clear();
		this.dispatchEvent(new CustomEvent('close', { detail: e }));
	}

	_error(e) {
		this._ready = false;
		this.dispatchEvent(new CustomEvent('error', { detail: e }));
	}

	get participants() {
		return this._participants;
	}

	get myID() {
		return this._myID;
	}

	get currentUrl() {
		return this._currentUrl;
	}

	send(msg, recipients) {
		if (!this._ready) {
			return false;
		}
		const headers = makeHeaders(this._myID, recipients);
		this._ws.send(join(headers, NEWLINE_BUF, msg));
		return true;
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
		this._ready = false;

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
		if (this._currentUrl === url && this._ready) {
			return;
		}
		this._currentUrl = url;
		this.reconnect();
	}
}
