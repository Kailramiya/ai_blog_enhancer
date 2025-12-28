
require('./src/config/env');

const app = require('./src/app');
const connectDB = require('./src/config/db');

const port = process.env.PORT || 5000;

async function start() {
	try {
		await connectDB();
		app.listen(port, () => {
			console.log(`Server running on port ${port}`);
		});
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
}

start();

