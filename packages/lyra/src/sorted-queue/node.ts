class QueueNode<TPayload> {
  public payload: TPayload;
  public priority: number;

  constructor(priority: number, payload: TPayload) {
    this.payload = payload;
    this.priority = priority;
  }
}

export { QueueNode };
export default QueueNode;
