import { forwardEvent, copyEvent } from '../util/event';
import JoinedBuffer from '../util/JoinedBuffer';

const START_PARTIAL = 0x80;

function resolveRecipients(participants, {
	recipients = [],
	one = false,
	andSelf = false,
} = {}) {
	const allRecipients = new Set(recipients);
	if (one) {
		// must resolve client-side so that all messages go to the same one
		const choices = new Set(participants);
		for (const r of recipients) {
			choices.delete(r);
		}
		allRecipients.add([...choices][Math.random() * choices.size]);
	}
	return {
		recipients: [...allRecipients],
		one: false,
		andSelf,
	};
}

function recipientsExist(participants, {recipients, andSelf}) {
	if (andSelf || !recipients.length) {
		return true;
	}
	return recipients.some((r) => participants.includes(r));
}

function percent(value, total) {
	return Math.max(0, Math.min(100, Math.round(value * 100 / total)));
}

export default class StringChamber extends EventTarget {
	constructor(delegate, maxChunkSize = 128 * 1024) {
		super();

		const forward = forwardEvent(this);

		this._sendQueue = [];
		this._receivers = new Map();
		this._lastSenderID = null;
		this._delegate = delegate;
		this._maxChunkSize = maxChunkSize;
		delegate.addEventListener('open', forward);
		delegate.addEventListener('message', this._message.bind(this));
		delegate.addEventListener('previousMessageTruncated', this._truncated.bind(this));
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

	_message({detail}) {
		const buffer = new JoinedBuffer(detail.data);
		const remaining = buffer.readUint8();
		const isStart = Boolean(remaining & START_PARTIAL);
		const rawPercent = remaining & ~START_PARTIAL;
		const isEnd = (rawPercent === 0);
		const remainingPercent = Math.max(0, rawPercent - 1);
		const data = buffer.read(JoinedBuffer.TO_END);

		this._lastSenderID = detail.senderID;
		let receiver;
		if (isStart) {
			receiver = new JoinedBuffer();
			this._receivers.set(detail.senderID, receiver);
		} else {
			receiver = this._receivers.get(detail.senderID);
			if (!receiver) {
				return;
			}
		}
		this.dispatchEvent(new CustomEvent('partialMessage', { detail: {
			...detail,
			isStart,
			data: undefined,
			partial: data,
			remainingPercent,
		} }));
	receiver.addFixed(data);
		if (isEnd) {
			this._receivers.delete(detail.senderID);
			this.dispatchEvent(new CustomEvent('message', { detail: {
				...detail,
				data: receiver.toBytes(),
			} }));
		}
	}

	_truncated(e) {
		if (!this._receivers.delete(this._lastSenderID)) {
			this.dispatchEvent(copyEvent(e));
		}
	}

	async _send() {
		while (this._sendQueue.length > 0) {
			const item = this._sendQueue[0];

			if (!recipientsExist(this._delegate.participants, item.recipients)) {
				// stop early; nobody is listening
				this._sendQueue.shift();
				item.resolve(false);
				continue;
			}

			const part = item.buffer.readNextChunk(this._maxChunkSize);

			let remaining = 0;
			if (item.buffer.bytesRemaining) {
				remaining |= percent(item.buffer.bytesRemaining, item.buffer.byteLength) + 1;
			}
			if (item.first) {
				remaining |= START_PARTIAL;
				item.first = false;
			}
			const success = await this._delegate.send(
				new JoinedBuffer(Uint8Array.of(remaining), part),
				item.recipients,
			);
			if (!success || !item.buffer.bytesRemaining) {
				this._sendQueue.shift();
				item.resolve(success);
			}
		}
	}

	send(msg, recipients) {
		const resolvedRecipients = resolveRecipients(
			this._delegate.participants,
			recipients,
		);
		return new Promise((resolve) => {
			this._sendQueue.push({
				recipients: resolvedRecipients,
				buffer: new JoinedBuffer(msg),
				first: true,
				resolve,
			});
			if (this._sendQueue.length === 1) {
				this._send();
			}
		});
	}
}
