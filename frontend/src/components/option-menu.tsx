"use client"

import type { ReactNode } from "react"
import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface OptionMenuProps {
  trigger: ReactNode
  label?: string
  options: string[]
  value: string
  onChange: (value: string) => void
  align?: "start" | "center" | "end"
  side?: "top" | "bottom"
}

export function OptionMenu({
  trigger,
  label,
  options,
  value,
  onChange,
  align = "start",
  side = "bottom",
}: OptionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        className="min-w-[200px] border-border bg-white text-foreground shadow-lg duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        {label && <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>}
        {label && <DropdownMenuSeparator className="bg-border" />}
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => onChange(option)}
            className={cn(
              "flex items-center justify-between gap-2 text-[13px] focus:bg-secondary focus:text-foreground",
              value === option && "bg-secondary font-medium text-foreground",
            )}
          >
            {option}
            {value === option && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
