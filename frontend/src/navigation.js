import { useEffect, useState } from 'react';

export function navigate(to) {
	if (typeof window === 'undefined') return;
	const target = String(to || '/');
	window.history.pushState({}, '', target);
	window.dispatchEvent(new Event('app:navigate'));
}

export function usePathname() {
	const [pathname, setPathname] = useState(() => {
		return typeof window !== 'undefined' ? window.location.pathname : '/';
	});

	useEffect(() => {
		function onChange() {
			setPathname(window.location.pathname);
		}

		window.addEventListener('popstate', onChange);
		window.addEventListener('app:navigate', onChange);
		return () => {
			window.removeEventListener('popstate', onChange);
			window.removeEventListener('app:navigate', onChange);
		};
	}, []);

	return pathname;
}
