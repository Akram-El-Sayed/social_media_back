const Joi = require("joi");

const updateProfileValidation = Joi.object({
  bio: Joi.string().trim().max(500).allow("").optional(),
                                
});

module.exports = { updateProfileValidation };