import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import './Button.scss'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'default' | 'text'
  active?: boolean
  // Draws attention to the "Buy Letter" call to action with an outward
  // pulsing glow — cosmetic only, not a distinct visual variant.
  pulse?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'default',
  active,
  pulse,
  iconLeft,
  iconRight,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const className = [
    'button',
    `button--${variant}`,
    active && 'button--active',
    pulse && 'button--pulse',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} type={type} className={className} aria-pressed={active} {...rest}>
      {iconLeft}
      <span className="button__label">{children}</span>
      {iconRight}
    </button>
  )
}
