package backend

import (
	"context"
	"runtime"
	"sync"
)

// a bounded pool of goroutines that execute tasks.
type WorkerPool struct {
	wg   sync.WaitGroup
	jobs chan func()
}

func NewWorkerPool(ctx context.Context, numWorkers int) *WorkerPool {
	if numWorkers <= 0 {
		numWorkers = runtime.NumCPU()
	}
	wp := &WorkerPool{
		jobs: make(chan func(), numWorkers*2),
	}
	for range numWorkers {
		wp.wg.Add(1)
		go wp.worker(ctx)
	}
	return wp
}

func (wp *WorkerPool) worker(ctx context.Context) {
	defer wp.wg.Done()
	for {
		select {
		case <-ctx.Done():
			// drain remaining jobs without executing them
			for range wp.jobs {
			}
			return
		case fn, ok := <-wp.jobs:
			if !ok {
				return
			}
			if ctx.Err() != nil {
				return
			}
			fn()
		}
	}
}

func (wp *WorkerPool) Submit(fn func()) {
	wp.jobs <- fn
}

func (wp *WorkerPool) Wait() {
	close(wp.jobs)
	wp.wg.Wait()
}
