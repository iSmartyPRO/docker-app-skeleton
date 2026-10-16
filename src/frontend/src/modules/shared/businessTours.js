/*
 * Registers the guided tours of the business modules — CRM, Masterplan,
 * Procurement, Contracts, Warehouse and «Ждёт меня» (Approvals) — with the
 * tours engine (docs/extending.md → «Guided tours»). Imported once by
 * App.jsx, so each tour auto-starts on the first visit to its module.
 */
import { registerTour } from '../../tour/engine';
import crmTour from '../crm/tour';
import masterplanTour from '../masterplan/tour';
import procurementTour from '../procurement/tour';
import contractsTour from '../contracts/tour';
import warehouseTour from '../warehouse/tour';
import approvalsTour from '../approvals/tour';

export const BUSINESS_TOURS = [crmTour, masterplanTour, procurementTour, contractsTour, warehouseTour, approvalsTour];

BUSINESS_TOURS.forEach((tour) => registerTour(tour));
