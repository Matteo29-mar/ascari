// frontend/src/components/Carousel.tsx
import React, { useEffect, useRef, useState } from 'react'

type Props = {
  images: string[]
  alt: string
}

export default function Carousel({ images, alt }: Props) {
  const trackRef = useRef<HTMLDivElement|null>(null)
  const [index, setIndex] = useState(0)

  function scrollTo(i: number) {
    if (!trackRef.current) return
    const clamped = Math.max(0, Math.min(images.length - 1, i))
    const x = clamped * trackRef.current.clientWidth
    trackRef.current.scrollTo({ left: x, behavior: 'smooth' })
    setIndex(clamped)
  }

  function onScroll() {
    if (!trackRef.current) return
    const i = Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth)
    if (i !== index) setIndex(i)
  }

  // Resize handler keeps the snap aligned when window resizes
  useEffect(() => {
    const onResize = () => scrollTo(index)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  return (
    <div className="carousel">
      <div className="carousel-track" ref={trackRef} onScroll={onScroll}>
        {images.map((src, i) => (
          <div className="slide" key={i}>
            <img
              src={src}
              alt={`${alt} #${i+1}`}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/cars/placeholder.jpg' }}
              loading="lazy"
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <div className="ctrl">
            <button aria-label="Prev" onClick={() => scrollTo(index - 1)}>‹</button>
            <button aria-label="Next" onClick={() => scrollTo(index + 1)}>›</button>
          </div>
          <div className="dots">
            {images.map((_, i) => (
              <div key={i} className={`dot ${i===index?'active':''}`} onClick={() => scrollTo(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
