class GameObjectManager
{
  static init()
  {
    this._gameObjects = [];
    this._gameObjectRemoved = false;
  }

  static _add(gameObject)
  {
    if (gameObject instanceof Tile)
    {
      this._gameObjects.unshift(gameObject);
    }
    else
    {
      this._gameObjects.push(gameObject);
    }
  }

  static deleteRemovedGameObjects()
  {
    if (this._gameObjectRemoved)
    {
      this._gameObjects  = this._gameObjects.filter(go => !go._removed);
    }
  }

  static createTile(pos, type, isWalkable)
  {
    switch(type)
    {
      case 2: // walkable rock
        this._add(new Tile(null, pos, new TileRenderer('#2e2e2e', 'black'), isWalkable));
        break;
      case 3: // walkable dirt
        this._add(new Tile(null, pos, new TileRenderer('#383727', 'black'), isWalkable));
        break;
      case 4: // walkable grass
        this._add(new Tile(null, pos, new TileRenderer('#0e3612', 'black'), isWalkable));
        break;
      case 5: // water
        this._add(new Tile(null, pos, new TileRenderer('#0e8eb8', 'white'), isWalkable));
        break;
      case 6: // stone wall
        this._add(new Tile(null, pos, new TileRenderer('#8e8e8e', 'white'), isWalkable));
        break;
      case 7: // stone object
        this._add(new Tile(null, pos, new TileTriangleRenderer('#8e8e8e'), isWalkable));
        break;
      case 8: // tree object
        this._add(new Tile(null, pos, new TileTriangleRenderer('#1a5f20'), isWalkable));
        break;
    }
  }

  static createPlayer(data)
  {
    let pos = new Vector2(data.pos.x, data.pos.y);
    let player = new Character(data.nid, pos, new CharacterRenderer('white'), data.name, data.actions);
    this._add(player);
    return player;
  }

  static createNPC(data)
  {
    let pos = new Vector2(data.pos.x, data.pos.y);
    let npc = new Character(data.nid, pos, new CharacterRenderer('yellow'), data.name, data.actions);
    this._add(npc, false);
    return npc;
  }

  static createEnemy(data)
  {
    let pos = new Vector2(data.pos.x, data.pos.y);
    let enemy = new Character(data.nid, pos, new CharacterRenderer('red'), data.name, data.actions);
    this._add(enemy, false);
    return enemy;
  }

  static createContainer(data)
  {
    let pos = new Vector2(data.pos.x, data.pos.y);
    let container = new Container(data.nid, pos, new TileBoxRenderer('#706d40'), data.name, data.actions);
    this._add(container, false);
    return container;
  }

  static createInteractable(data)
  {
    let pos = new Vector2(data.pos.x, data.pos.y);
    let interactable = new Interactable(data.nid, pos, new TileBoxRenderer('#16e700'), data.name, data.actions);
    this._add(interactable, false);
    return interactable;
  }

  static getByNID(nid)
  {
    return this._gameObjects.find(go => go.nid === nid);
  }

  static getObjectsNearPosition(pos, range)
  {
    return this._gameObjects.filter(go => {
      return go.pos.isInRange(pos, range);
    });
  }

  static dispose()
  {
    this._gameObjects = [];
  }
}

class GameObject
{
  constructor(nid=null, pos, renderer)
  {
    this.nid = nid;
    this.pos = pos;
    this.renderer = renderer;
    this._removed = false;
  }

  destroy()
  {
    this._removed = true;
    GameObjectManager._gameObjectRemoved = true;
  }

  update(game) {}
  getActions() {}

  render(canvasContext, camera)
  {
    if (this.renderer && camera.isInViewport(this.pos))
    {
      this.renderer.render(canvasContext, {
        pos: camera.getRenderPos(this.pos),
        size: camera.pixelsPerUnit
      });
    }
  }

  renderGUI(canvasContext, camera)
  {
    if (this.renderer && this instanceof Character && camera.isInViewport(this.pos))
    {
      let pos = camera.getRenderPos(this.pos);
      pos.add(new Vector2(0, -camera.pixelsPerUnit));
      this.renderer.renderGUI(canvasContext, {
        pos: pos,
        text: this.name
      });
    }
  }
}

class Tile extends GameObject
{
  constructor(nid, pos, renderer, isWalkable)
  {
    super(nid, pos, renderer);
    this.isWalkable = isWalkable;
  }

  getActions()
  {
    if (this.isWalkable)
    {
      return [new WalkAction("Walk to", Vector2.clone(this.pos))];
    }
  }
}

class Character extends GameObject
{
  constructor(nid, pos, renderer, name, actions)
  {
    super(nid, pos, renderer);
    this.name = name;
    this._isOwned = false;
    this.state = 'idle';
    this.path = null;
    this.nextPath = null;
    this.speed = null;
    this.actions = actions;
  }

  setPath(path)
  {
    this.state = 'moving';
    this.path = path;
  }

  update(game)
  {
    switch(this.state)
    {
      case 'moving':
        this.move();
        break;
      case 'attacking':
        this.attack();
        break;
    }
    if (this._isOwned)
    {
      game.display.pos = Vector2.clone(this.pos);
    }
  }

  getActions()
  {
    let actions = [];
    this.actions.forEach(a => {
      if (a === 'talk')
      {
        actions.push(new TalkAction(`Talk to ${this.name}`, this.nid));
      }
      else if (a === 'attack')
      {
        actions.push(new AttackAction(`Attack ${this.name}`, this.nid));
      }
    });
    return actions;
  }

  move()
  {
    if (!this.path)
    {
      this.state = 'idle';
      return;
    }

    let nextPos = this.path[0];
    let movementDistance = this.speed * Time.deltaTime;

    while(nextPos)
    {
      let curPos = this.pos;

      let diff = Vector2.sub(nextPos, curPos);
      let distance = diff.length;

      if (movementDistance < distance) // if next node is not reached
      {
        let norm = Vector2.normalize(diff);
        norm.mult(movementDistance);
        this.pos.add(norm);
        return;
      }
      else // if next node is reached
      {
        movementDistance -= distance;
        this.pos = Vector2.clone(nextPos);

        this.path.shift(); // remove first element
        if (this.path.length === 0) // if destination reached
        {
          if (this.nextPath) // continue to next path if possible
          {
            this.path = this.nextPath;
            this.nextPath = null;
            nextPos = Vector2.clone(this.path[0]);
          }
          else {
            this.state = 'idle';
            this.path = null;
            return;
          }
        }
        else // if path continues
        {
          nextPos = Vector2.clone(this.path[0]);
        }
      }
    }
  }

  attack()
  {

  }
}

class Container extends GameObject
{
  constructor(nid, pos, renderer, name, actions)
  {
    super(nid, pos, renderer);
    this.name = name;
    this.actions = actions;
  }

  getActions()
  {
    return [new TalkAction(`Interact with ${this.name}`, this.nid)];
  }
}

class Interactable extends GameObject
{
  constructor(nid, pos, renderer, name, actions)
  {
    super(nid, pos, renderer);
    this.name = name;
    this.actions = actions;
  }

  getActions()
  {
    return [new InteractAction(`Interact with ${this.name}`, this.nid)];
  }
}
