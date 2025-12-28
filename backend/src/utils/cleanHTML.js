
const cheerio = require('cheerio');

function cleanHTML(rawHtml, options = {}) {
	const { output = 'text' } = options;
	const html = rawHtml == null ? '' : String(rawHtml);

	const $ = cheerio.load(html);

	$('script, style, nav, footer, header').remove();

	const root = $('body').length ? $('body') : $.root();

	if (output === 'html') {
		return (root.html() || '').trim();
	}

	return root.text().replace(/\s+/g, ' ').trim();
}

module.exports = cleanHTML;

