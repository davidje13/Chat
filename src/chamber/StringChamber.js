import { encodeUTF8, decodeUTF8 } from '../util/buffer';

export default class StringChamber extends EventTarget {
	constructor(delegate) {
		super();

		const forward = (e) => {
			this.dispatchEvent(new CustomEvent(e.type, { detail: e.detail }));
		};

		this.delegate = delegate;
		this.delegate.addEventListener('open', forward);
		this.delegate.addEventListener('message', ({detail}) => {
			this.dispatchEvent(new CustomEvent('message', { detail: {
				...detail,
				data: decodeUTF8(detail.data),
			} }));
		});
		this.delegate.addEventListener('previousMessageTruncated', forward);
		this.delegate.addEventListener('close', forward);
		this.delegate.addEventListener('error', forward);
	}

	get participants() {
		return this.delegate.participants;
	}

	get myID() {
		return this.delegate.myID;
	}

	send(msg, recipients) {
		return this.delegate.send(encodeUTF8(msg), recipients);
	}
}
