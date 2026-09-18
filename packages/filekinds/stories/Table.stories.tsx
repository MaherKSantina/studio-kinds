import type { Meta, StoryObj } from "@storybook/react-vite";
import TableView from "../src/components/table/TableView";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Table",
  parameters: {
    docs: {
      description: {
        component:
          "Tabular files rendered as THEMSELVES — an A1 grid of cells and rows, the way the pdf " +
          "kind renders pages. `.csv`/`.tsv` parse in place (RFC-4180 quoting, auto delimiter); " +
          "`.xlsx`/`.xls` decode from the host's raw-bytes endpoint via SheetJS, with sheet tabs " +
          "when a workbook carries several. First row emphasized as the header it almost always is.",
      },
    },
  },
};
export default meta;

const SHIFTS = `Client,Staff,Service Date,Service Type,Duration,Charge
"Charaf, Moustafa",Fatin Jebeili,26/08/2026,SOAP Note,1,90
Irfaan Azizi,Fatin Jebeili,25/08/2026,SOAP Note,1,55
Taha Moradi,Fatin Jebeili,25/08/2026,SOAP Note,1,90
Kazim Haidari,Fatin Jebeili,21/08/2026,"SOAP Note, extended",1,90
,,,"Gross Pay",4,325
`;

export const Csv: StoryObj = {
  name: "CSV (quoting, header row, totals tail)",
  render: () => (
    <div style={{ height: "100vh" }}>
      <TableView content={SHIFTS} path="/Fatin/jason-shift-notes.csv" />
    </div>
  ),
};
