import { encodeUTF8, decodeUTF8 } from './utf8';

const EMPTY_ARRAY = new Uint8Array(0);
const DYNAMIC_SIZE_BYTES = 4;

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
	throw new Error('cannot interpret array with platform-dependent byte ordering as bytes');
}

// big endian byte functions (ensure consistent ordering for network communications)

export function uintToBytes(value, size) {
	if (size === 1) {
		return Uint8Array.of(value);
	}
	const result = new Uint8Array(size);
	let v = value;
	for (let i = size; (i --) > 0;) {
		result[i] = v & 0xFF;
		v >>= 8;
	}
	return result;
}

export function bytesToUint(bytes, pos, size) {
	let v = 0;
	for (let i = 0; i < size; ++ i) {
		v = (v << 8) | bytes[pos + i];
	}
	return v;
}

export function countUintBytes(v) {
	let b = 0;
	while (v > 0) {
		v >>= 8;
		++ b;
	}
	return b;
}

function resolveSize(data, pos, length, size) {
	if (size === DYNAMIC) {
		const dynamicSize = bytesToUint(data, pos, DYNAMIC_SIZE_BYTES);
		return {
			start: pos + DYNAMIC_SIZE_BYTES,
			end: pos + DYNAMIC_SIZE_BYTES + dynamicSize,
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

	get bytesRemaining() {
		return this._byteLength - this._readPos;
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
				this._parts.push(uintToBytes(datum._byteLength, DYNAMIC_SIZE_BYTES));
				this._parts.push(...datum._parts);
				this._byteLength += DYNAMIC_SIZE_BYTES + datum._byteLength;
			} else {
				const bytes = bytesFrom(datum);
				this._parts.push(uintToBytes(bytes.byteLength, DYNAMIC_SIZE_BYTES));
				this._parts.push(bytes);
				this._byteLength += DYNAMIC_SIZE_BYTES + bytes.byteLength;
			}
		});
		return this;
	}

	read(size) {
		const allData = this.toBytes();
		const { start, end } = resolveSize(allData, this._readPos, this._byteLength, size);
		this._readPos = end;
		return allData.subarray(start, end);
	}

	readNextChunk(size) {
		const allData = this.toBytes();
		const start = this._readPos;
		const end = Math.min(start + size, this._byteLength);
		this._readPos = end;
		return allData.subarray(start, end);
	}

	readUint8() {
		return this.toBytes()[this._readPos ++];
	}

	readUint(size) {
		const allData = this.toBytes();
		const value = bytesToUint(allData, this._readPos, size);
		this._readPos += size;
		return value;
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
