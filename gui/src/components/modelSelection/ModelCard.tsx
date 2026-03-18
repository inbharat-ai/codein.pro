import { BookOpenIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import {
  defaultBorderRadius,
  greenButtonColor,
  lightGray,
  vscFocusBorder,
} from "..";
import { PackageDimension } from "../../pages/AddNewModel/configs/models";
import { providers } from "../../pages/AddNewModel/configs/providers";
import HeaderButtonWithToolTip from "../gui/HeaderButtonWithToolTip";
import InfoHover from "../InfoHover";
import { ModelProviderTag } from "./ModelProviderTag";
import { ModelProviderTags } from "./utils";

interface ModelCardProps {
  title: string;
  description: string;
  tags?: ModelProviderTags[];
  refUrl?: string;
  icon?: string;
  onClick?: (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    dimensionChoices?: string[],
    selectedProvider?: string,
  ) => void;
  disabled?: boolean;
  dimensions?: PackageDimension[];
  providerOptions?: string[];
}

function ModelCard(props: ModelCardProps) {
  const [dimensionChoices, setDimensionChoices] = useState<string[]>(
    props.dimensions?.map((d) => Object.keys(d.options)[0]) || [],
  );

  const [hovered, setHovered] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (props.providerOptions?.length) {
      setSelectedProvider(props.providerOptions[0]);
    }
  }, [props.providerOptions]);

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${lightGray}`,
    borderRadius: defaultBorderRadius,
    position: "relative",
    width: "100%",
    transition: "all 0.5s",
    ...(props.disabled
      ? { opacity: 0.5 }
      : hovered
        ? {
            border: `1px solid ${greenButtonColor}`,
            backgroundColor: `${greenButtonColor}22`,
            cursor: "pointer",
          }
        : {}),
  };

  const dimensionsDivStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    marginLeft: "auto",
    padding: 4,
    flexWrap: "wrap",
    rowGap: 12,
    borderTop: `1px solid ${lightGray}`,
  };

  return (
    <div style={cardStyle}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="px-2 py-1"
        onClick={
          props.disabled
            ? undefined
            : (e) => {
                if ((e.target as HTMLElement).closest("a")) {
                  return;
                }
                props.onClick?.(e, dimensionChoices, selectedProvider);
              }
        }
      >
        <div
          className="mb-2"
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          {window.vscMediaUrl && props.icon && (
            <img
              src={`${window.vscMediaUrl}/logos/${props.icon}`}
              width="24px"
              height="24px"
              style={{
                borderRadius: "2px",
                padding: "4px",
                marginRight: "10px",
                objectFit: "contain",
              }}
            />
          )}
          <h3>{props.title}</h3>
        </div>

        {props.tags?.map((tag, i) => <ModelProviderTag key={i} tag={tag} />)}

        <p>{props.description}</p>

        {props.refUrl && (
          <a
            style={{
              position: "absolute",
              right: "8px",
              top: "8px",
            }}
            href={props.refUrl}
            target="_blank"
          >
            <HeaderButtonWithToolTip text="Read the docs">
              <BookOpenIcon width="1.6em" height="1.6em" />
            </HeaderButtonWithToolTip>
          </a>
        )}
      </div>

      {(props.dimensions?.length || props.providerOptions?.length) && (
        <div style={dimensionsDivStyle}>
          {props.dimensions?.map((dimension, i) => {
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <InfoHover
                      id={dimension.name}
                      msg={dimension.description}
                    />
                    <p className="mx-2 my-0 py-0 text-sm">{dimension.name}</p>
                  </div>
                  <div className="flex items-center">
                    {Object.keys(dimension.options).map((key) => {
                      const isSelected = dimensionChoices[i] === key;
                      return (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            const newChoices = [...dimensionChoices];
                            newChoices[i] = key;
                            setDimensionChoices(newChoices);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            marginRight: 8,
                            backgroundColor: isSelected
                              ? greenButtonColor
                              : lightGray,
                            color: isSelected ? "white" : undefined,
                            padding: 4,
                            borderRadius: defaultBorderRadius,
                            outline: `0.5px solid ${lightGray}`,
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.outline =
                              `1px solid ${vscFocusBorder}`;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.outline =
                              `0.5px solid ${lightGray}`;
                          }}
                        >
                          {key}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <br />
              </>
            );
          })}
          {props.providerOptions?.length && (
            <div className="rtl flex flex-wrap items-center justify-end">
              <div className="flex items-center">
                <InfoHover
                  id={"provider-info"}
                  msg={
                    "Select the provider through which you will access the model"
                  }
                />
              </div>
              <div className="rtl flex flex-wrap items-center justify-end">
                {props.providerOptions?.map((option, i) => {
                  const info = providers[option];
                  if (!info) {
                    return null;
                  }
                  return (
                    <HeaderButtonWithToolTip
                      text={info.title}
                      className="mx-1 items-center p-2 text-center"
                      style={{
                        backgroundColor:
                          (i === 0 &&
                            typeof selectedProvider === "undefined") ||
                          selectedProvider === option
                            ? greenButtonColor + "aa"
                            : undefined,
                      }}
                      onClick={() => {
                        setSelectedProvider(option);
                      }}
                    >
                      {window.vscMediaUrl && info.icon && (
                        <img
                          src={`${window.vscMediaUrl}/logos/${info.icon}`}
                          height="24px"
                        />
                      )}
                    </HeaderButtonWithToolTip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ModelCard;
