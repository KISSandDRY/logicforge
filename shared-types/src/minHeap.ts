/**
 * Детермінована бінарна купа мінімумів (Min-Heap) зі складністю O(log M)
 * для впорядкування подій дискретно-подійного симулятора за часом tau та порядковим номером.
 */
export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compareFn: (a: T, b: T) => number) {
    this.compare = compareFn;
  }

  public get size(): number {
    return this.items.length;
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public peek(): T | undefined {
    return this.items[0];
  }

  public clear(): void {
    this.items.length = 0;
  }

  public push(value: T): void {
    this.items.push(value);
    this.siftUp(this.items.length - 1);
  }

  public pop(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  public toArray(): T[] {
    return [...this.items].sort(this.compare);
  }

  private siftUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.compare(this.items[idx], this.items[parentIdx]) < 0) {
        const tmp = this.items[idx];
        this.items[idx] = this.items[parentIdx];
        this.items[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let idx = index;
    const len = this.items.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      let smallest = idx;

      if (left < len && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left;
      }
      if (right < len && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== idx) {
        const tmp = this.items[idx];
        this.items[idx] = this.items[smallest];
        this.items[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}
