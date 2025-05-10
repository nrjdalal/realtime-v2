"use client"

import { useEffect, useRef, useState } from "react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"

interface StreamTimerProps {
  isActive: boolean
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export const StreamTimer = ({ isActive }: StreamTimerProps) => {
  const [time, setTime] = useState(0)
  const intervalRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (isActive) {
      setTime(0)
      intervalRef.current = window.setInterval(() => {
        setTime((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (intervalRef.current !== undefined) {
        clearInterval(intervalRef.current)
        intervalRef.current = undefined
      }
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive && time > 0) {
      toast.info(`Stream ended: ${formatTime(time)}`)
    }
  }, [isActive, time])

  if (!isActive) return null

  return (
    <Badge className="absolute top-5 left-1/2 z-10 -translate-x-1/2" variant="destructive">
      {formatTime(time)}
    </Badge>
  )
}
