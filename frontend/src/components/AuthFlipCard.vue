<template>
  <div class="auth-flip-card" data-testid="auth-flip-card">
    <div
      class="auth-flip-card__inner"
      :class="{
        'is-flipped': flipped,
        'is-animated': animate
      }"
    >
      <section
        class="auth-flip-card__face auth-flip-card__face--front"
        :class="{ 'is-active': !flipped }"
        :aria-hidden="flipped"
        :inert="flipped"
        data-testid="auth-login-face"
      >
        <slot name="front" />
      </section>

      <section
        class="auth-flip-card__face auth-flip-card__face--back"
        :class="{ 'is-active': flipped }"
        :aria-hidden="!flipped"
        :inert="!flipped"
        data-testid="auth-register-face"
      >
        <slot name="back" />
      </section>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AuthFlipCard',
  props: {
    flipped: {
      type: Boolean,
      default: false
    },
    animate: {
      type: Boolean,
      default: true
    }
  }
}
</script>

<style scoped>
.auth-flip-card {
  width: 100%;
  max-width: 430px;
  margin-inline: auto;
  perspective: 1800px;
}

.auth-flip-card__inner {
  display: grid;
  width: 100%;
  transform-origin: center center;
  transform-style: preserve-3d;
}

.auth-flip-card__inner.is-animated {
  transition: transform 1050ms cubic-bezier(0.65, 0.05, 0.36, 1);
  will-change: transform;
}

.auth-flip-card__inner.is-flipped {
  transform: rotateY(180deg);
}

.auth-flip-card__face {
  grid-area: 1 / 1;
  width: 100%;
  min-width: 0;
  align-self: start;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  pointer-events: none;
}

.auth-flip-card__face.is-active {
  pointer-events: auto;
}

.auth-flip-card__face--back {
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .auth-flip-card__inner.is-animated {
    transition: none !important;
  }
}
</style>
