import { useEffect, useMemo, useState } from 'react';

import { extractOldestBlogs, fetchAllArticles } from '../services/api';
import { navigate } from '../navigation';

const FOCUSED_IDS_STORAGE_KEY = 'beyondchats.focusedOriginalIds';

function getIdString(value) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value._id) return String(value._id);
	return String(value);
}

function ArticleCard({ article, badgeText, badgeUpdated, emptyText }) {
	if (!article) {
		return (
			<div className="card card--empty">
				{emptyText || '—'}
			</div>
		);
	}

	return (
		<a
			href={`/articles/${encodeURIComponent(article._id)}`}
			className="card card--link"
			onClick={(e) => {
				// Allow normal browser behaviors (open in new tab, etc.)
				if (e.defaultPrevented) return;
				if (e.button !== 0) return;
				if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
				e.preventDefault();
				navigate(`/articles/${encodeURIComponent(article._id)}`);
			}}
		>
			<div className="card__top">
				<h2 className="card__title">{article.title}</h2>
				<span className={`badge ${badgeUpdated ? 'badge--muted' : ''}`}>{badgeText}</span>
			</div>
		</a>
	);
}

export default function ArticlesList() {
	const [articles, setArticles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [extracting, setExtracting] = useState(false);
	const [focusedOriginalIds, setFocusedOriginalIds] = useState(null);

	useEffect(() => {
		// Persist across full-page navigations (we use <a href> links).
		try {
			const raw = typeof window !== 'undefined' ? window.localStorage.getItem(FOCUSED_IDS_STORAGE_KEY) : null;
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length > 0) {
				setFocusedOriginalIds(parsed.map(String).filter(Boolean));
			}
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');
			try {
				const data = await fetchAllArticles();
				if (cancelled) return;
				setArticles(Array.isArray(data) ? data : []);
			} catch (e) {
				if (cancelled) return;
				setError(e && e.message ? e.message : 'Failed to load articles');
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleExtract() {
		setExtracting(true);
		setError('');
		try {
			const result = await extractOldestBlogs(5);
			const originals = result && Array.isArray(result.originals) ? result.originals : [];
			const ids = originals.map((o) => getIdString(o && o._id)).filter(Boolean);
			setFocusedOriginalIds(ids);
			try {
				window.localStorage.setItem(FOCUSED_IDS_STORAGE_KEY, JSON.stringify(ids));
			} catch {
				// ignore
			}

			const data = await fetchAllArticles();
			setArticles(Array.isArray(data) ? data : []);
		} catch (e) {
			setError(e && e.message ? e.message : 'Failed to extract articles');
		} finally {
			setExtracting(false);
			setLoading(false);
		}
	}

	const items = useMemo(() => {
		return (Array.isArray(articles) ? articles : []).filter((a) => a && a._id && a.title);
	}, [articles]);

	const pairs = useMemo(() => {
		const list = Array.isArray(items) ? items : [];
		if (!Array.isArray(focusedOriginalIds) || focusedOriginalIds.length === 0) {
			return [];
		}

		let originals = list.filter((a) => a && a.isUpdatedVersion === false);
		const focus = new Set(focusedOriginalIds);
		originals = originals.filter((o) => focus.has(getIdString(o._id)));
		const updated = list.filter((a) => a && a.isUpdatedVersion === true);

		const updatedByOriginalId = new Map();
		for (const u of updated) {
			const key = getIdString(u.originalArticleId);
			if (!key) continue;
			// If multiple exist, keep the first one we see.
			if (!updatedByOriginalId.has(key)) updatedByOriginalId.set(key, u);
		}

		return originals.map((o) => ({
			original: o,
			updated: updatedByOriginalId.get(getIdString(o._id)) || null,
		}));
	}, [items, focusedOriginalIds]);

	return (
		<div className="app-shell">
			<div className="app-header">
				<h1 className="app-title">Articles</h1>
				<div className="toolbar">
					<button onClick={handleExtract} disabled={extracting} className="btn">
						{extracting ? 'Extracting…' : 'Extract 5 oldest from website'}
					</button>
				</div>
			</div>

			<p className="app-subtitle">
				Extract the 5 oldest BeyondChats posts, then open any row to compare the original vs updated version.
			</p>

			{loading ? <p className="status">Loading…</p> : null}
			{!loading && error ? <p className="status status--danger">{error}</p> : null}

			{!loading && !error && (!Array.isArray(focusedOriginalIds) || focusedOriginalIds.length === 0) ? (
				<p className="status">Click “Extract 5 oldest from website” to load articles.</p>
			) : null}

			<div className="pairs">
				{pairs.map((pair) => (
					<div key={pair.original._id} className="pair-row">
						<ArticleCard article={pair.original} badgeText="Original" badgeUpdated={false} />
						<ArticleCard
							article={pair.updated}
							badgeText="Updated"
							badgeUpdated={true}
							emptyText="Not updated yet"
						/>
					</div>
				))}
			</div>
		</div>
	);
}
