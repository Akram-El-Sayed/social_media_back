const Joi = require("joi");

const TextValidation = Joi.object({
  text: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required(),
});

module.exports = { TextValidation };