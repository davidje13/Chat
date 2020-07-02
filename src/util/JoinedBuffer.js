import { encodeUTF8, decodeUTF8 } from './utf8';

const EMPTY_ARRAY = new Uint8Array(0);

function bytesFrom(data) {
	if (data instanceof Uint8Array) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (typeof data === 'string') {
		return encodeUTF8(data);
	}
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function resolveSize(data, pos, length, size) {
	if (size === DYNAMIC) {
		const header = new Uint32Array(
			data.buffer,
			data.byteOffset + pos,
			1,
		);
		return {
			start: pos + header.byteLength,
			end: pos + header.byteLength + header[0],
		};
	}
	if (size === TO_END) {
		return {
			start: pos,
			end: length,
		};
	}
	if (size instanceof Until) {
		let end = data.indexOf(size.byte);
		if (end === -1) {
			end = length;
		}
		return {
			start: pos,
			end,
		};
	}
	if (typeof size === 'number' && size >= 0) {
		return {
			start: pos,
			end: pos + size,
		};
	}
	throw new Error(`unknown size ${size}`);
}

const TO_END = Symbol();
const DYNAMIC = Symbol();

class Until {
	constructor(byte) {
		this.byte = byte;
	}
}

export default class JoinedBuffer {
	constructor(...data) {
		this._parts = [];
		this._byteLength = 0;
		this._readPos = 0;
		this.addFixed(...data);
	}

	get byteLength() {
		return this._byteLength;
	}

	addFixed(...data) {
		data.forEach((datum) => {
			if (datum instanceof JoinedBuffer) {
				this._parts.push(...datum._parts);
				this._byteLength += datum._byteLength;
			} else {
				const bytes = bytesFrom(datum);
				this._parts.push(bytes);
				this._byteLength += bytes.byteLength;
			}
		});
		return this;
	}

	addDynamic(...data) {
		data.forEach((datum) => {
			if (datum instanceof JoinedBuffer) {
				this._parts.push(bytesFrom(Uint32Array.of(datum._byteLength)));
				this._parts.push(...datum._parts);
				this._byteLength += Uint32Array.BYTES_PER_ELEMENT + datum._byteLength;
			} else {
				const bytes = bytesFrom(datum);
				this._parts.push(bytesFrom(Uint32Array.of(bytes.byteLength)));
				this._parts.push(bytes);
				this._byteLength += Uint32Array.BYTES_PER_ELEMENT + bytes.byteLength;
			}
		});
		return this;
	}

	hasData() {
		return this._readPos < this._byteLength;
	}

	read(size) {
		const allData = this.toBytes();
		const { start, end } = resolveSize(allData, this._readPos, this._byteLength, size);
		this._readPos = end;
		return allData.subarray(start, end);
	}

	readByte() {
		return this.toBytes()[this._readPos ++];
	}

	skip(size) {
		const allData = this.toBytes();
		const { end } = resolveSize(allData, this._readPos, this._byteLength, size);
		this._readPos = end;
		return this;
	}

	readString(size = DYNAMIC) {
		return decodeUTF8(this.read(size));
	}

	split(...sizes) {
		const result = [];
		for (const size of sizes) {
			result.push(this.read(size));
		}
		if (this._readPos < this._byteLength) {
			result.push(this.read(TO_END));
		} else {
			result.push(EMPTY_ARRAY);
		}
		return result;
	}

	toBytes() {
		if (!this._parts.length) {
			return EMPTY_ARRAY;
		}
		if (this._parts.length > 1) {
			const combined = new Uint8Array(this._byteLength);
			let pos = 0;
			for (const part of this._parts) {
				combined.set(part, pos);
				pos += part.byteLength;
			}
			this._parts = [combined];
		}
		return this._parts[0];
	}
}

JoinedBuffer.TO_END = TO_END;
JoinedBuffer.DYNAMIC = DYNAMIC;
JoinedBuffer.UNTIL = (byte) => new Until(byte);
