const Joi = require('joi')

const objectId = Joi.string().hex().length(24);

const reportSchema = Joi.object({
      postId: objectId.optional().allow(null, ''),
      reportedUserId: objectId.optional().allow(null, ''),
      type: Joi.string().valid('spam', 'harassment', "hate_speech" ,"nudity" ,"violence",'fake_account', 'other').required(),
      reason: Joi.string().min(5).max(500).required(),
    }).or('postId', 'reportedUserId');

    module.exports = {reportSchema}