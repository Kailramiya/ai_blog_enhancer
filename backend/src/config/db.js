
const mongoose = require('mongoose');

async function connectDB() {
	const mongoUri = process.env.MONGODB_URI;
	if (!mongoUri) {
		const message = 'MONGODB_URI is not set';
		console.error(message);
		throw new Error(message);
	}

	try {
		const conn = await mongoose.connect(mongoUri);
		console.log(`MongoDB connected: ${conn.connection.host}`);
		return conn;
	} catch (err) {
		console.error('MongoDB connection error:', err);
		throw err;
	}
}

module.exports = connectDB;

