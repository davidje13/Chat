import JoinedBuffer, { countUintBytes, uintToBytes } from '../util/JoinedBuffer';
import { copyEvent } from '../util/event';

class Channel extends EventTarget {
	constructor(parent, idBuffer) {
		super();

		this._parent = parent;
		this._idBuffer = idBuffer;
	}

	get isConnected() {
		return this._parent._delegate.isConnected;
	}

	get myID() {
		return this._parent._delegate.myID;
	}

	get participants() {
		return this._parent._delegate.participants;
	}

	send(msg, ...args) {
		return this._parent._delegate.send(new JoinedBuffer(this._idBuffer, msg), ...args);
	}
}

export default class MultiplexedChamber {
	constructor(delegate, maxChannels = 256) {
		if (maxChannels > 0xFFFFFFFF) {
			throw new Error('unsupported channel count');
		}
		this._headerBytes = countUintBytes(maxChannels - 1);
		this._maxChannels = 1 << (this._headerBytes * 8);
		this._channels = new Map();
		this._lastMessageChannel = null;
		this._delegate = delegate;
		const forwardToAll = (e) => this._channels.forEach((c) => c.dispatchEvent(copyEvent(e)));
		delegate.addEventListener('open', forwardToAll);
		delegate.addEventListener('message', this._message.bind(this));
		delegate.addEventListener('previousMessageTruncated', this._truncated.bind(this));
		delegate.addEventListener('close', forwardToAll);
		delegate.addEventListener('error', forwardToAll);
	}

	channel(id) {
		let channel = this._channels.get(id);
		if (!channel) {
			if (typeof id !== 'number' || id < 0 || id >= this._maxChannels || Math.round(id) !== id) {
				throw new Error('invalid channel ID');
			}
			const idBuffer = uintToBytes(id, this._headerBytes);
			channel = new Channel(this, idBuffer);
			this._channels.set(id, channel);
		}
		return channel;
	}

	_message({detail}) {
		const buffer = new JoinedBuffer(detail.data);
		const channelID = buffer.readUint(this._headerBytes);
		const subData = buffer.read(JoinedBuffer.TO_END);
		const channel = this._channels.get(channelID);
		this._lastMessageChannel = channel;
		if (channel) {
			channel.dispatchEvent(new CustomEvent('message', { detail: { ...detail, data: subData } }));
		}
	}

	_truncated(e) {
		if (this._lastMessageChannel) {
			this._lastMessageChannel.dispatchEvent(copyEvent(e));
		}
	}
}
