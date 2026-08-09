import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import './SelectField.scss'

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id'> {
  label: string
  id?: string
  hideLabel?: boolean
}

// The chevron rotates on :focus (see SelectField.scss) as a stand-in for
// Figma's "Active" state — native <select> exposes no reliable, cross-
// browser way to detect that its dropdown popover is actually open.
export function SelectField({
  label,
  id,
  hideLabel = false,
  children,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const labelClassName = hideLabel
    ? 'select-field__label select-field__label--hidden'
    : 'select-field__label'

  return (
    <div className="select-field">
      <label className={labelClassName} htmlFor={selectId}>
        {label}
      </label>
      <div className="select-field__control">
        <select id={selectId} className="select-field__select" {...rest}>
          {children}
        </select>
        <ChevronDown size={16} className="select-field__chevron" aria-hidden="true" />
      </div>
    </div>
  )
}
