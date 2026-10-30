"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkPicked, MAX_IMAGES } from "@/core/image/fit-size";
import { Button } from "@/components/ui/button";
import { IMAGE_BUTTON_LABEL, IMAGE_LABEL, imageStatusText } from "./spec-form-text";
import { useStructureStore } from "./StructureStoreProvider";

// 이미지는 보조 입력이다. 고르는 순간 형식·5MB·3장 한도를 검사하고, 전송 때 브라우저에서 줄인다(lib/client/resize-images.ts)
export default function ImagePicker({ disabled }: { disabled: boolean }) {
  const images = useStructureStore((s) => s.images);
  const addImages = useStructureStore((s) => s.addImages);
  const removeImage = useStructureStore((s) => s.removeImage);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 썸네일 주소는 이미지 목록이 바뀔 때만 만들고, 바뀌거나 사라질 때 해제한다
  const urls = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div className="flex flex-col gap-2">
      <p id="image-label" className="text-sm font-medium text-foreground">
        {IMAGE_LABEL}
      </p>

      {/* 브라우저 기본 파일 입력("선택된 파일 없음" 문구 포함)은 숨기고, 버튼 부품으로 대신 연다. 버튼은 Tab·Enter·Space로 쓸 수 있다 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // 같은 파일을 다시 고를 수 있게 한다
          if (files.length === 0) return;
          const check = checkPicked(images.length, files);
          if (!check.ok) return setMessage(check.message);
          setMessage(null);
          addImages(files);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || images.length >= MAX_IMAGES}
          aria-labelledby="image-label image-button-text"
          aria-describedby="image-status"
          onClick={() => inputRef.current?.click()}
        >
          <span id="image-button-text">{IMAGE_BUTTON_LABEL}</span>
        </Button>
        <span id="image-status" role="status" aria-live="polite" className="text-sm text-foreground-secondary">
          {imageStatusText(images.length)}
        </span>
      </div>

      <p className="text-xs text-foreground-tertiary">PNG·JPEG·WebP, 장당 5MB 이하. 전송 전에 브라우저에서 줄여 보내며, 이미지 원본은 저장하지 않습니다.</p>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex flex-col gap-1">
              {/* 브라우저 안의 임시 주소(blob:)라 next/image를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={f.name} className="h-20 w-full rounded-lg border border-border object-cover" />
              <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => removeImage(i)} aria-label={`${f.name} 삭제`}>
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
