const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export function join(...parts) {
	const totalBytes = parts.reduce((t, b) => (t + b.byteLength), 0);
	const combined = new Uint8Array(totalBytes);
	let pos = 0;
	for (const part of parts) {
		let array;
		if (part instanceof Uint8Array) {
			array = part;
		} else if (part instanceof ArrayBuffer) {
			array = new Uint8Array(part);
		} else {
			array = new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
		}
		combined.set(array, pos);
		pos += array.byteLength;
	}
	return combined;
}

export function encodeUTF8(str) {
	return encoder.encode(str);
}

export function decodeUTF8(data) {
	return decoder.decode(data);
}
