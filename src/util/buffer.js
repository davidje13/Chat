const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export function join(...buffers) {
	const totalBytes = buffers.reduce((t, b) => (t + b.byteLength), 0);
	const combined = new Uint8Array(totalBytes);
	let pos = 0;
	for (const buffer of buffers) {
		let array = buffer;
		if (buffer instanceof ArrayBuffer) {
			array = new Uint8Array(buffer);
		}
		combined.set(array, pos);
		pos += array.length;
	}
	return combined.buffer;
}

export function encodeUTF8(str) {
	return encoder.encode(str);
}

export function decodeUTF8(str) {
	return decoder.decode(str);
}

export function readString(data, from, to) {
	return decodeUTF8(data.subarray(from, to));
}
