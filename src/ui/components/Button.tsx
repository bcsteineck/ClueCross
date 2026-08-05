import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import './Button.scss'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'default' | 'reveal' | 'text'
  active?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'default',
  active,
  iconLeft,
  iconRight,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const className = ['button', `button--${variant}`, active && 'button--active']
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
