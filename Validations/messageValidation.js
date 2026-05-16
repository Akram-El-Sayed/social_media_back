const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const sendMessageValidation = Joi.object({
  receiverId: objectId.required(),
  text: Joi.string().min(1).max(500).trim().required(),
});

const conversationIdValidation = Joi.object({
  conversationId: objectId.required(),
});

const editMessageValidation = Joi.object({
  messageId: objectId.required(),
  text: Joi.string().min(1).max(1000).required(),
});

const reactParamsValidation = Joi.object({
  messageId: objectId.required(),
});

const reactBodyValidation = Joi.object({
  type: Joi.string()
    .valid("like", "love", "haha", "sad", "angry")
    .required(),
});

const getReactionUsersValidation = Joi.object({
  messageId: objectId.required(),
});

const getReactionQueryValidation = Joi.object({
  type: Joi.string().valid("like", "love", "haha", "sad", "angry").required(),
  limit: Joi.number().integer().min(1).max(50).default(20),
  cursor: Joi.number().integer().min(0).default(0),
})

const sharePostValidation = Joi.object({
  receiverId: Joi.string().required(),
  text: Joi.string().allow("").optional(),
});

module.exports = {
  sendMessageValidation,
  conversationIdValidation,
  editMessageValidation,
  reactBodyValidation,
  reactParamsValidation,
  getReactionUsersValidation,
  getReactionQueryValidation,
  sharePostValidation,
};