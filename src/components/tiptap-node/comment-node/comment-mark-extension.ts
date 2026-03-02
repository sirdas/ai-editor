import { Mark, mergeAttributes } from "@tiptap/core";

export const Comment = Mark.create({
	name: "comment",

	addAttributes() {
		return {
			commentId: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-comment-id"),
				renderHTML: (attributes) => {
					if (!attributes.commentId) {
						return {};
					}
					return {
						"data-comment-id": attributes.commentId,
					};
				},
			},
		};
	},

	parseHTML() {
		return [{ tag: "span[data-comment-id]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["span", mergeAttributes(HTMLAttributes), 0];
	},
});
