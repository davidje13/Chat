import { encodeUTF8, decodeUTF8 } from '../util/utf8';
import { forwardEvent } from '../util/event';

export default class StringChamber extends EventTarget {
	constructor(delegate) {
		super();

		const forward = forwardEvent(this);

		this._delegate = delegate;
		delegate.addEventListener('open', forward);
		delegate.addEventListener('message', ({detail}) => {
			const data = decodeUTF8(detail.data);
			this.dispatchEvent(new CustomEvent('message', { detail: { ...detail, data } }));
		});
		delegate.addEventListener('previousMessageTruncated', forward);
		delegate.addEventListener('close', forward);
		delegate.addEventListener('error', forward);
	}

	get isConnected() {
		return this._delegate.isConnected;
	}

	get myID() {
		return this._delegate.myID;
	}

	get participants() {
		return this._delegate.participants;
	}

	send(msg, ...args) {
		return this._delegate.send(encodeUTF8(msg), ...args);
	}
}
