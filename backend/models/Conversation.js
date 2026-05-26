const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick participant lookup
conversationSchema.index({ participants: 1 });

// Static method to find or create a conversation between two users
conversationSchema.statics.findOrCreate = async function (user1Id, user2Id) {
  let conversation = await this.findOne({
    participants: { $all: [user1Id, user2Id] },
  });

  if (!conversation) {
    conversation = await this.create({
      participants: [user1Id, user2Id],
    });
  }

  return conversation;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
