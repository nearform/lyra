import { QueueNode } from "./node";

class SortedQueue<TPaylod> {
  public queue: QueueNode<TPaylod>[];
  private maxPriority = Number.MIN_SAFE_INTEGER;
  private minPriority = Number.MAX_SAFE_INTEGER;

  constructor() {
    this.queue = [];
  }

  enqueue(node: QueueNode<TPaylod>) {
    if (node.priority >= this.maxPriority) {
      this.maxPriority = node.priority;
      return this.queue.push(node);
    }

    if (node.priority <= this.minPriority) {
      this.minPriority = node.priority;
      this.queue.unshift(node);
      return 0;
    }

    for (let i = 0; i < this.queue.length; i++) {
      if (node.priority <= this.queue[i].priority) {
        this.queue.splice(i, 0, node);
        return i;
      }
    }

    return this.queue.push(node);
  }
}

export { SortedQueue };
export default SortedQueue;
