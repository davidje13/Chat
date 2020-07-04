import EventSet from '../util/EventSet';
import { encodeUTF8, decodeUTF8 } from '../util/utf8';
import { copyEvent } from '../util/event';
import JoinedBuffer from '../util/JoinedBuffer';

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

export default class EchoChamber extends EventTarget {
	constructor(delegate) {
		super();

		this._myID = null;
		this._participants = new EventSet();
		this._delegate = delegate;
		delegate.addEventListener('message', this._message.bind(this));
		delegate.addEventListener('close', this._close.bind(this));
		delegate.addEventListener('error', this._error.bind(this));
	}

	_message({detail: {data}}) {
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
		this.dispatchEvent(copyEvent(e));
	}

	_error(e) {
		this._myID = null;
		this.dispatchEvent(copyEvent(e));
	}

	get isConnected() {
		return this._delegate.isConnected && Boolean(this._myID);
	}

	get myID() {
		return this._myID;
	}

	get participants() {
		return this._participants;
	}

	send(msg, recipients) {
		if (!this._myID) {
			return Promise.resolve(false);
		}
		const headers = makeHeaders(this._myID, recipients);
		return this._delegate.send(new JoinedBuffer(headers, NEWLINE_BUF, msg));
	}
}
