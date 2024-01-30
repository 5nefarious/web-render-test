<script lang="ts">
    import { Renderer } from '$lib/renderer.ts';

    async function initRenderer() {
        const canvas = document.querySelector('canvas');
        if (!canvas) {
            throw new Error("Failed to grab canvas for rendering.")
        }

        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported on this browser.");
        }

        const renderer = await Renderer.create(canvas, navigator.gpu);

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentBoxSize[0].inlineSize;
                const height = entry.contentBoxSize[0].blockSize;
                renderer.handleResize(width, height);
            }
        });
        observer.observe(canvas);
        
        function renderLoop(timeStamp: DOMHighResTimeStamp) {
            window.requestAnimationFrame(renderLoop);
            renderer.update(timeStamp);
        }
        renderLoop(performance.now());
    }
</script>

<svelte:head>
    <title>Render Test</title>
</svelte:head>

<canvas />

<!-- svelte-ignore empty-block -->
{#await initRenderer()}{/await}

<style>
    canvas {
        position: absolute;
        height: 100%;
        width: 100%;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
    }
</style>