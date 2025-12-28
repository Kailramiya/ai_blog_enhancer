import ArticlesList from './pages/ArticlesList';
import ArticleDetail from './pages/ArticleDetail';

function getArticleIdFromPathname(pathname) {
	const path = String(pathname || '');
	const match = path.match(/\/articles\/([^/]+)\/?$/);
	return match ? decodeURIComponent(match[1]) : '';
}

export default function App() {
	const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
	const articleId = getArticleIdFromPathname(pathname);

	if (articleId) {
		return <ArticleDetail articleId={articleId} />;
	}

	return <ArticlesList />;
}
