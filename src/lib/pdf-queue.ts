/**
 * Очередь генерации PDF.
 * Счёт на 500 позиций — самая прожорливая операция вкладки: параллельный рендер
 * нескольких документов съедает память и подвешивает интерфейс. Поэтому задачи
 * выполняются строго по одной, а ожидающие получают статус «в очереди».
 */
type Job<T> = () => Promise<T>;

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;

export function pdfQueueLength() {
  return pending;
}

/**
 * @param onQueued вызывается с позицией в очереди (>0), если задача ждёт.
 */
export function runPdfJob<T>(job: Job<T>, onQueued?: (position: number) => void): Promise<T> {
  const position = pending;
  pending += 1;
  if (position > 0) onQueued?.(position);

  const run = chain.then(job, job);
  chain = run.then(
    () => {
      pending -= 1;
    },
    () => {
      pending -= 1;
    },
  );
  return run as Promise<T>;
}
