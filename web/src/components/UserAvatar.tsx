import Avvvatars from "avvvatars-react";

interface UserAvatarProps {
  /** Email or unique identifier for the user - generates unique avatar */
  value: string;
  /** Override display text (e.g., "JD" for John Doe) */
  displayValue?: string;
  /** Size in pixels (default 32) */
  size?: number;
  /** Use "character" for letters or "shape" for unique shapes */
  style?: "character" | "shape";
  /** Add shadow effect */
  shadow?: boolean;
  /** Custom border radius (default is circle) */
  radius?: number;
  /** Show border */
  border?: boolean;
  /** Border width (default 2) */
  borderSize?: number;
  /** Border color (default #fff) */
  borderColor?: string;
}

/**
 * User avatar component using avvvatars-react.
 * Generates unique, consistent avatars based on email/identifier.
 */
export function UserAvatar({
  value,
  displayValue,
  size = 32,
  style = "shape",
  shadow = false,
  radius,
  border = false,
  borderSize = 2,
  borderColor = "#fff",
}: UserAvatarProps) {
  return (
    <Avvvatars
      value={value}
      displayValue={displayValue}
      size={size}
      style={style}
      shadow={shadow}
      radius={radius}
      border={border}
      borderSize={borderSize}
      borderColor={borderColor}
    />
  );
}

export default UserAvatar;
