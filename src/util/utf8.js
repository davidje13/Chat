const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export function encodeUTF8(str) {
	return encoder.encode(str);
}

export function decodeUTF8(data) {
	return decoder.decode(data);
}
