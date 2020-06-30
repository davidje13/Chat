export default class RemoteChamber extends EventTarget {
	constructor() {
		super();

		this.currentUrl = '';
		this.ws = null;
		this.myID = null;
		this.ready = false;
		this.knownParticipants = new Set();

		this._open = this._open.bind(this);
		this._message = this._message.bind(this);
		this._close = this._close.bind(this);
		this._error = this._error.bind(this);
	}

	_open() {
		this.ready = true;
		this.dispatchEvent(new CustomEvent('connectionOpen'));
	}

	_participantsChanged() {
		this.dispatchEvent(new CustomEvent('participantsChanged', { detail: {
			participants: this.knownParticipants,
			myID: this.myID,
		} }));
	}

	_id(id) {
		this.myID = id;
		this.dispatchEvent(new CustomEvent('open', { detail: {
			id,
			participants: this.knownParticipants,
		} }));
		this._participantsChanged();
	}

	_hi(id) {
		this.knownParticipants.add(id);
		if (this.myID) {
			this.dispatchEvent(new CustomEvent('hi', { detail: {
				id,
				participants: this.knownParticipants,
				myID: this.myID,
			} }));
			this._participantsChanged();
		}
	}

	_bye(id) {
		this.knownParticipants.delete(id);
		if (this.myID) {
			this.dispatchEvent(new CustomEvent('bye', { detail: {
				id,
				participants: this.knownParticipants,
				myID: this.myID,
			} }));
			this._participantsChanged();
		}
	}

	_message({data}) {
		let p = data.indexOf('\n');
		if (p === -1) {
			p = data.length;
		}
		let offset = 0;
		let sender = null;
		let gotId = null;
		const unknownHeaders = [];
		while (offset < p) {
			let q = data.indexOf(':', offset);
			if (q === -1) {
				q = p;
			}
			const headLn = data.substr(offset, q - offset);
			if (headLn.startsWith('I')) {
				gotId = headLn.substr(1);
			} else if (headLn.startsWith('H')) {
				this._hi(headLn.substr(1));
			} else if (headLn.startsWith('B')) {
				this._bye(headLn.substr(1));
			} else if (headLn.startsWith('F')) {
				sender = headLn.substr(1);
			} else if (headLn === 'X') {
				this.dispatchEvent(new CustomEvent('previousMessageTruncated'));
			} else {
				unknownHeaders.push(headLn);
			}
			offset = q + 1;
		}
		if (gotId) {
			// invoke ID callback at end so that we can distinguish
			// people who were already in the room before we joined
			this._id(gotId);
		}
		if (unknownHeaders.length > 0) {
			this.dispatchEvent(new CustomEvent('unknownHeaders', { detail: unknownHeaders }));
		}
		if (data.length >= p + 1) {
			this.dispatchEvent(new CustomEvent('message', { detail: {
				senderID: sender,
				myID: this.myID,
				data: data.substr(p + 1),
				unknownHeaders,
			} }));
		}
	}

	_close(e) {
		this.ready = false;
		this.myID = null;
		this.knownParticipants.clear();
		this.dispatchEvent(new CustomEvent('close', { detail: e }));
		this._participantsChanged();
	}

	_error(e) {
		this.ready = false;
		this.dispatchEvent(new CustomEvent('error', { detail: e }));
	}

	_makeHeaders({ recipients = [], one = false, andSelf = false } = {}) {
		const headers = [];
		if (recipients.length > 0) {
			headers.push(...recipients.map((r) => `T${r}`));
			if (one) {
				throw new Error('invalid recipient list');
			}
			if (andSelf) {
				headers.push(`T${this.myID}`);
			}
		} else if (one) {
			headers.push('T*');
			if (andSelf) {
				headers.push(`T${this.myID}`);
			}
		} else if (andSelf) {
			headers.push('T**');
		}
		return headers;
	}

	send(msg, recipients) {
		if (!this.ready) {
			return false;
		}
		const headers = this._makeHeaders(recipients);
		this.ws.send(headers.join(':') + '\n' + msg);
		return true;
	}

	reconnect() {
		if (this.ws !== null) {
			this.ws.removeEventListener('open', this._open);
			this.ws.removeEventListener('message', this._message);
			this.ws.removeEventListener('close', this._close);
			this.ws.removeEventListener('error', this._error);
			this.ws.close();
			this._close();
		}
		this.ready = false;

		try {
			this.ws = new WebSocket(this.currentUrl, ['echo']);
			this.ws.addEventListener('open', this._open);
			this.ws.addEventListener('message', this._message);
			this.ws.addEventListener('close', this._close);
			this.ws.addEventListener('error', this._error);
		} catch (e) {
			this._error(e);
		}
	}

	setUrl(url) {
		if (this.currentUrl === url && this.ready) {
			return;
		}
		this.currentUrl = url;
		this.reconnect();
	}
}
