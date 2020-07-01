export function copyEvent(e) {
	if (e instanceof CustomEvent) {
		return new CustomEvent(e.type, e);
	} else if (e instanceof CloseEvent) {
		return new CloseEvent(e.type, e);
	} else {
		return new Event(e.type, e);
	}
}

export function forwardEvent(to) {
	return (e) => to.dispatchEvent(copyEvent(e));
}
