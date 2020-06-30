export default function make(type, attrs = {}, children = []) {
	const o = document.createElement(type);
	Object.keys(attrs).forEach((key) => {
		o.setAttribute(key, attrs[key]);
	});
	children.forEach((c) => {
		if (typeof c === 'string') {
			o.appendChild(document.createTextNode(c));
		} else {
			o.appendChild(c);
		}
	});
	return o;
}
