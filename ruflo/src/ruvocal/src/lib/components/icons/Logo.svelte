<script lang="ts">
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		classNames?: string;
	}

	let { classNames = "" }: Props = $props();
</script>

<svg
	width="32"
	height="32"
	viewBox="0 0 1651 1651"
	xmlns="http://www.w3.org/2000/svg"
	class="logo {classNames}"
	aria-label="{publicConfig.PUBLIC_APP_NAME} logo"
	role="img"
>
	<defs>
		<linearGradient id="n3x-flow-ring" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#5cc8ff" />
			<stop offset="100%" stop-color="#8b7cff" />
		</linearGradient>
	</defs>
	<!-- Símbolo N3XUS (círculo + X curvo) -->
	<circle cx="825.5" cy="825.5" r="825.5" fill="#05070c" />
	<circle class="ring" cx="825.5" cy="825.5" r="770" fill="none" stroke="url(#n3x-flow-ring)" stroke-width="56" />
	<g fill="none" stroke="#fff" stroke-width="88" stroke-linecap="round" stroke-linejoin="round">
		<path d="M380 540 L770 742 Q832 772 894 742 L1270 540" />
		<path d="M380 1110 L770 955 Q826 925 882 955 L1270 1110" />
	</g>
</svg>

<style>
	.ring {
		transform-origin: center;
		animation: ring-pulse 3s ease-in-out infinite;
	}

	@keyframes ring-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.55; }
	}

	@media (prefers-reduced-motion: reduce) {
		.ring { animation: none; }
	}
</style>
