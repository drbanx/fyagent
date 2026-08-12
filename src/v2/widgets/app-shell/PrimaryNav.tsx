import { NavLink } from "react-router-dom";

import { navigationItems } from "../../shared/config/navigation";
import { classNames } from "../../shared/design-system/classNames";
import { LiquidGlassLens } from "../../shared/ui/LiquidGlassLens";

export function PrimaryNav() {
  return (
    <nav
      className="fy-primary-nav"
      aria-label="主导航"
      data-testid="primary-navigation"
    >
      {navigationItems.map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          className={({ isActive, isPending }) =>
            classNames(
              "fy-primary-nav-item",
              isActive && "fy-primary-nav-item-selected",
              isPending && "fy-primary-nav-item-pending",
            )
          }
        >
          {({ isActive }) => {
            const label = (
              <span className="fy-primary-nav-label">{item.label}</span>
            );

            return isActive ? (
              <LiquidGlassLens>{label}</LiquidGlassLens>
            ) : (
              label
            );
          }}
        </NavLink>
      ))}
    </nav>
  );
}
