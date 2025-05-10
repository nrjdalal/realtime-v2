import { useLayoutEffect, useState } from "react"

export const useWindowSize = () => {
  const [size, setSize] = useState({
    width: null as number | null,
    height: null as number | null,
    resize: false as boolean,
  })

  useLayoutEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setSize({
        width,
        height,
        resize: height / width < 9 / 16,
      })
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  return size
}
