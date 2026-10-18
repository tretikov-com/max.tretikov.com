import React from "react";

export default function SessionAccount({ name, onSignOut }) {
  return <div className="secret-account">
    <span className="secret-account-name">{name}</span>
    <button type="button" onClick={onSignOut}>SIGN OUT <span aria-hidden="true">↗</span></button>
  </div>;
}
