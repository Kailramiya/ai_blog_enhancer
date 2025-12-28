
const mongoose = require('mongoose');

const { Schema } = mongoose;

const ReferenceSchema = new Schema(
	{
		title: String,
		url: String,
	},
	{ _id: false }
);

const ArticleSchema = new Schema({
	title: { type: String, required: true },
	slug: { type: String, unique: true, index: true },
	originalUrl: String,
	content: String,
	isUpdatedVersion: { type: Boolean, default: false },
	originalArticleId: { type: Schema.Types.ObjectId, ref: 'Article', default: null },
	references: [ReferenceSchema],
	createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Article', ArticleSchema);

