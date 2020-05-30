const StoryManager = require('./story_manager');

class ProgressCondition {
  constructor(progressItem, condition, done = false) {
    this._progressItem = progressItem;
    this._type = condition.type;
    this._target = condition.target;
    this._text = condition.text;
    if (!done) {
      this._progressItem.eventEmitter.addListener(this._type, this._onEvent);
    }
    this._done = done;
  }

  get done() {
    return this._done;
  }

  _onEvent = (value) => {
    if (value === this._target) {
      this._done = true;
      this._progressItem.conditionDone(this);
    }
  }

  dispose() {
    this._progressItem.eventEmitter.removeListener(this._type, this._onEvent);
    this._progressItem = null;
  }

  toJSON() {
    return {
      text: this._text,
      done: this._done
    }; 
  }
}

/**
 * An item that represents progress.
 * Eg. quest or system message about progress
 */
class ProgressItem {
  constructor(eventEmitter, data) {
    this._eventEmitter = eventEmitter;
    this._key = data.key;
    this._title = data.title;
    this._text = data.text;
  }

  get eventEmitter() {
    return this._eventEmitter;
  }

  conditionDone(condition) {}
  _onConditionsDone() {}

  dispose() {
    this._eventEmitter = null;
  }
}

class Quest extends ProgressItem {
  constructor(eventEmitter, data) {
    super(eventEmitter, data);
    this._stages = [];
    data.stages.forEach(s => {
      this._stages.push(new QuestStage(eventEmitter, this, s));
    });
  }

  stageDone(stage) {
    let stageIndex = this._stages.findIndex(s => s.key = stage.key);
    let nextStage = this._stages[stageIndex + 1];
    nextStage.show = true;

    this._eventEmitter.connection.send({
      type: 'logUpdate',
      item: this
    });
  }

  toJSON() {
    return {
      type: 'quest',
      title: this._title,
      text: this._text,
      stages: this._stages.filter(s => s.show)
    };
  }

  dispose() {
    super.dispose();
    this._stages.forEach(s => s.dispose());
    this._stages = [];
  }
}

class QuestStage extends ProgressItem {
  constructor(eventEmitter, quest, data) {
    super(eventEmitter, data);
    this._quest = quest;
    this._conditions = [];
    if (data.conditions) {
      data.conditions.forEach(c => {
        this._conditions.push(new ProgressCondition(this, c));
      });
    }
    this.show = this._key === 'requirements'; // always show requirements
    this._done = false;
  }

  conditionDone(condition) {
    if (!this._conditions.some(c => !c.done)) {
      this._onConditionsDone();
    }
    else {
      this._eventEmitter.connection.send({
        type: 'logUpdate',
        item: this._quest
      });
    }
  }

  _onConditionsDone() {
    this._done = true;
    this._quest.stageDone(this);
  }

  toJSON() {
    return {
      key: this._key,
      text: this._text,
      conditions: this._conditions
    };
  }

  dispose() {
    super.dispose();
    this._quest = null;
    this._conditions.forEach(c => c.dispose());
    this._conditions = [];
  }
}

class Message extends ProgressItem {
  constructor(eventEmitter, data) {
    super(eventEmitter, data);
    this._conditions = [];
    data.conditions.forEach(c => {
      this._conditions.push(new ProgressCondition(this, c));
    });
    this._show = false;
  }

  get show() {
    return this._show;
  }

  conditionDone(condition) {
    this._conditions = this._conditions.filter(c => c != condition);
    condition.dispose();

    if (this._conditions.length === 0) {
      this._onConditionsDone();
    }
  }

  _onConditionsDone() {
    this._eventEmitter.connection.send({
      type: 'dialog',
      title: this._title,
      text: this._text
    });
    this._show = true;

    this._eventEmitter.connection.send({
      type: 'logUpdate',
      item: this
    });
  }

  toJSON() {
    return {
      type: 'message',
      key: this._key,
      title: this._title,
      text: this._text
    };
  }

  dispose() {
    super.dispose();
    this._conditions.forEach(c => c.dispose());
    this._conditions = [];
  }
}

/**
 * Class that tracks a user's progress in story.
 */
class Progress {
  constructor(user, progressData) {
    this._user = user;

    this._messages = [];
    StoryManager.messages.forEach(mData => {
      this._messages.push(new Message(user, mData));
    });

    this._quests = [];
    StoryManager.quests.forEach(qData => {
      this._quests.push(new Quest(user, qData));
    });
  }

  get quests() {
    return this._quests;
  }

  get messages() {
    return this._messages.filter(m => m.show);
  }

  dispose() {
    this._user = null;
    this._quests.forEach(q => q.dispose());
    this._quests = [];
    this._messages.forEach(m => m.dispose());
    this._messages = [];
  }
}

module.exports = Progress;
