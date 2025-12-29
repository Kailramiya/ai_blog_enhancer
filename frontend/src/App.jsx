import ArticlesList from './pages/ArticlesList';
import ArticleDetail from './pages/ArticleDetail';
import { usePathname } from './navigation';

function getArticleIdFromPathname(pathname) {
	const path = String(pathname || '');
	const match = path.match(/\/articles\/([^/]+)\/?$/);
	return match ? decodeURIComponent(match[1]) : '';
}

export default function App() {
	const pathname = usePathname();
	const articleId = getArticleIdFromPathname(pathname);

	if (articleId) {
		return <ArticleDetail articleId={articleId} />;
	}

	return <ArticlesList />;
}
