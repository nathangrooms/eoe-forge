import gsap from 'gsap';

export type CardAnimationType = 
  | 'CAST_SPELL'
  | 'ATTACK_START'
  | 'ATTACK_RESOLVE'
  | 'CREATURE_DIES'
  | 'TOKEN_CREATED'
  | 'COUNTER_ADDED'
  | 'MOVE_ZONE'
  | 'EXILE'
  | 'BATTLE_DAMAGE'
  | 'TAP'
  | 'UNTAP'
  | 'DRAW_CARD'
  | 'MILL_CARD';

export interface AnimationPayload {
  cardElement: HTMLElement;
  targetElement?: HTMLElement;
  sourceZone?: string;
  targetZone?: string;
  damage?: number;
  counters?: number;
}

/**
 * Central animation manager for all card/game animations
 * Uses GSAP for complex timelines and hardware-accelerated transforms
 */
export class AnimationManager {
  private static activeAnimations: gsap.core.Timeline[] = [];
  private static animationSpeed = 1;

  /**
   * Set global animation speed multiplier
   */
  static setSpeed(speed: number) {
    this.animationSpeed = speed;
    gsap.globalTimeline.timeScale(speed);
  }

  /**
   * Check if animations should be reduced (accessibility)
   */
  static shouldReduceMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Cast spell animation - card lifts and moves to stack
   */
  static castSpell(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform, opacity' })
        .to(cardElement, {
          y: -50,
          scale: 1.15,
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.8)',
          duration: 0.2,
          ease: 'power2.out'
        })
        .to(cardElement, {
          x: targetElement ? targetElement.offsetLeft - cardElement.offsetLeft : 0,
          y: targetElement ? targetElement.offsetTop - cardElement.offsetTop : -100,
          duration: 0.4,
          ease: 'power1.inOut'
        })
        .to(cardElement, {
          scale: 0.9,
          opacity: 0.8,
          duration: 0.15
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Attack start animation - creature charges forward
   */
  static attackStart(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      // Pulse effect
      timeline
        .set(cardElement, { willChange: 'transform' })
        .to(cardElement, {
          scale: 1.1,
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.8)',
          duration: 0.15,
          ease: 'power2.out'
        })
        .to(cardElement, {
          scale: 1.05,
          duration: 0.1
        });

      // If there's a target, animate toward it
      if (targetElement) {
        const deltaX = (targetElement.offsetLeft - cardElement.offsetLeft) * 0.3;
        const deltaY = (targetElement.offsetTop - cardElement.offsetTop) * 0.3;
        
        timeline
          .to(cardElement, {
            x: deltaX,
            y: deltaY,
            duration: 0.3,
            ease: 'power2.inOut'
          })
          .to(cardElement, {
            x: 0,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: 'power2.out'
          });
      } else {
        timeline.to(cardElement, {
          scale: 1,
          duration: 0.2
        });
      }

      timeline
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Battle damage animation - flash and shake
   */
  static battleDamage(payload: AnimationPayload): Promise<void> {
    const { cardElement, damage = 0 } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    // Create damage number that floats up
    const damageNumber = document.createElement('div');
    damageNumber.className = 'absolute text-2xl font-bold text-red-500 pointer-events-none z-50';
    damageNumber.textContent = `-${damage}`;
    damageNumber.style.left = `${cardElement.offsetLeft + cardElement.offsetWidth / 2}px`;
    damageNumber.style.top = `${cardElement.offsetTop}px`;
    cardElement.parentElement?.appendChild(damageNumber);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform' })
        // Flash red
        .to(cardElement, {
          backgroundColor: 'rgba(239, 68, 68, 0.3)',
          duration: 0.1
        })
        // Shake
        .to(cardElement, {
          x: -5,
          duration: 0.05,
          repeat: 3,
          yoyo: true
        })
        .to(cardElement, {
          backgroundColor: 'transparent',
          x: 0,
          duration: 0.1
        })
        // Float damage number
        .to(damageNumber, {
          y: -50,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out'
        }, 0)
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          damageNumber.remove();
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Creature death animation - shake, crack, fade to graveyard
   */
  static creatureDies(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement } = payload;
    
    if (this.shouldReduceMotion()) {
      cardElement.style.opacity = '0';
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform, opacity' })
        // Shake violently
        .to(cardElement, {
          rotation: -5,
          duration: 0.05,
          repeat: 5,
          yoyo: true
        })
        // Crack effect (darken and scale down)
        .to(cardElement, {
          scale: 0.95,
          opacity: 0.7,
          filter: 'brightness(0.5)',
          duration: 0.2
        })
        // Fly to graveyard
        .to(cardElement, {
          x: targetElement ? targetElement.offsetLeft - cardElement.offsetLeft : 0,
          y: targetElement ? targetElement.offsetTop - cardElement.offsetTop : 100,
          scale: 0.5,
          rotation: 180,
          opacity: 0,
          duration: 0.5,
          ease: 'power2.in'
        })
        .set(cardElement, { clearProps: 'all' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Token creation animation - materialize from nothing
   */
  static tokenCreated(payload: AnimationPayload): Promise<void> {
    const { cardElement } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { 
          willChange: 'transform, opacity',
          scale: 0,
          opacity: 0,
          filter: 'brightness(2)'
        })
        .to(cardElement, {
          scale: 1.2,
          opacity: 1,
          duration: 0.3,
          ease: 'back.out(1.7)'
        })
        .to(cardElement, {
          scale: 1,
          filter: 'brightness(1)',
          duration: 0.2,
          ease: 'power2.out'
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Counter added animation - badge pops and pulses
   */
  static counterAdded(payload: AnimationPayload): Promise<void> {
    const { cardElement, counters = 1 } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    // Find or create counter badge
    let counterBadge = cardElement.querySelector('.counter-badge') as HTMLElement;
    if (!counterBadge) {
      counterBadge = document.createElement('div');
      counterBadge.className = 'counter-badge absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold z-20';
      counterBadge.textContent = `+${counters}`;
      cardElement.appendChild(counterBadge);
    } else {
      const current = parseInt(counterBadge.textContent?.replace('+', '') || '0');
      counterBadge.textContent = `+${current + counters}`;
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(counterBadge, { willChange: 'transform' })
        .fromTo(counterBadge, 
          { scale: 0.5 },
          { scale: 1.3, duration: 0.2, ease: 'back.out(1.7)' }
        )
        .to(counterBadge, {
          scale: 1,
          duration: 0.15,
          ease: 'power2.out'
        })
        .set(counterBadge, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Move zone animation - card flies between zones
   */
  static moveZone(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement, sourceZone, targetZone } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    // Determine if card should flip (e.g., exile face-down)
    const shouldFlip = targetZone === 'exile' || targetZone === 'library';

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform, opacity' })
        .to(cardElement, {
          scale: 0.8,
          opacity: 0.8,
          duration: 0.15,
          ease: 'power2.out'
        });

      if (targetElement) {
        timeline.to(cardElement, {
          x: targetElement.offsetLeft - cardElement.offsetLeft,
          y: targetElement.offsetTop - cardElement.offsetTop,
          rotationY: shouldFlip ? 180 : 0,
          duration: 0.5,
          ease: 'expo.inOut'
        });
      }

      timeline
        .to(cardElement, {
          scale: 1,
          opacity: 1,
          duration: 0.15
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Tap animation - rotate 90 degrees
   */
  static tap(payload: AnimationPayload): Promise<void> {
    const { cardElement } = payload;
    
    if (this.shouldReduceMotion()) {
      cardElement.style.transform = 'rotate(90deg)';
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform' })
        .to(cardElement, {
          rotation: 90,
          duration: 0.3,
          ease: 'power2.out'
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Untap animation - rotate back to 0 degrees
   */
  static untap(payload: AnimationPayload): Promise<void> {
    const { cardElement } = payload;
    
    if (this.shouldReduceMotion()) {
      cardElement.style.transform = 'rotate(0deg)';
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform' })
        .to(cardElement, {
          rotation: 0,
          duration: 0.3,
          ease: 'power2.out'
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Draw card animation - card slides from library to hand
   */
  static drawCard(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement } = payload;
    
    if (this.shouldReduceMotion()) {
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { 
          willChange: 'transform, opacity',
          opacity: 0,
          scale: 0.5
        })
        .to(cardElement, {
          opacity: 1,
          scale: 1,
          x: targetElement ? targetElement.offsetLeft - cardElement.offsetLeft : 0,
          y: targetElement ? targetElement.offsetTop - cardElement.offsetTop : 0,
          duration: 0.4,
          ease: 'power2.out'
        })
        .set(cardElement, { clearProps: 'willChange' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Exile animation - card flies off screen with spin
   */
  static exile(payload: AnimationPayload): Promise<void> {
    const { cardElement, targetElement } = payload;
    
    if (this.shouldReduceMotion()) {
      cardElement.style.opacity = '0';
      return Promise.resolve();
    }

    const timeline = gsap.timeline();
    this.activeAnimations.push(timeline);

    return new Promise((resolve) => {
      timeline
        .set(cardElement, { willChange: 'transform, opacity' })
        .to(cardElement, {
          x: targetElement ? targetElement.offsetLeft - cardElement.offsetLeft : 200,
          y: targetElement ? targetElement.offsetTop - cardElement.offsetTop : -200,
          rotation: 720,
          scale: 0.3,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.in'
        })
        .set(cardElement, { clearProps: 'all' })
        .call(() => {
          resolve();
          this.activeAnimations = this.activeAnimations.filter(t => t !== timeline);
        });
    });
  }

  /**
   * Kill all active animations (for cleanup/reset)
   */
  static killAll() {
    this.activeAnimations.forEach(timeline => timeline.kill());
    this.activeAnimations = [];
  }
}
