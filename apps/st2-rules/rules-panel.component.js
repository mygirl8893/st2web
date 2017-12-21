import React from 'react';
import { PropTypes } from 'prop-types';
import { connect } from 'react-redux';
import store from './store';

import api from '@stackstorm/module-api';
import {
  actions as flexActions,
} from '@stackstorm/module-flex-table/flex-table.reducer';
import setTitle from '@stackstorm/module-title';

import FlexTable from '@stackstorm/module-flex-table/flex-table.component';
import {
  Panel,
  PanelView,
  Toolbar,
  ToolbarButton,
  ToolbarActions,
  ToolbarSearch,
  Content,
  ContentEmpty,
  ToggleButton,
} from '@stackstorm/module-panel';
import RulesFlexCard from './rules-flex-card.component';
import RulesDetails from './rules-details.component';

import './style.less';

@connect((state, props) => {
  const { uid } = props;
  const { collapsed = state.collapsed } = state.tables[uid] || {};

  return { collapsed, ...props };
}, (dispatch, props) => {
  const { uid } = props;

  return {
    onToggle: () => store.dispatch(flexActions.toggle(uid)),
  };
})
class FlexTableWrapper extends FlexTable {
  componentDidMount() {
    const { uid } = this.props;

    store.dispatch(flexActions.register(uid));
  }
}

@connect((state) => {
  const { groups, filter, triggerSpec, criteriaSpecs, actionSpec, packSpec, collapsed } = state;
  return { groups, filter, triggerSpec, criteriaSpecs, actionSpec, packSpec, collapsed };
})
export default class RulesPanel extends React.Component {
  static propTypes = {
    notification: PropTypes.object,
    history: PropTypes.object,
    location: PropTypes.shape({
      search: PropTypes.string,
    }),
    match: PropTypes.shape({
      params: PropTypes.shape({
        ref: PropTypes.string,
        section: PropTypes.string,
      }),
    }),

    groups: PropTypes.array,
    filter: PropTypes.string,
    triggerSpec: PropTypes.object,
    criteriaSpecs: PropTypes.object,
    actionSpec: PropTypes.object,
    packSpec: PropTypes.object,
    collapsed: PropTypes.bool,
  }

  state = {
    id: undefined,
  }

  componentDidMount() {
    let { ref: id } = this.props.match.params;
    if (!id) {
      const { groups } = this.props;
      id = groups.length > 0 && groups[0].rules.length > 0 ? groups[0].rules[0].ref : undefined;
    }
    if (id !== this.state.id) {
      this.setState({ id });
    }

    this.fetchGroups().then(() => {
      const { id } = this.urlParams;
      if (id) {
        store.dispatch(flexActions.toggle(id.split('.')[0], false));
      }
    });

    const { notification } = this.props;

    store.dispatch({
      type: 'FETCH_PACK_SPEC',
      promise: api.client.packs.list()
        .catch((res) => {
          notification.error('Unable to retrieve pack spec. See details in developer tools console.');
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });

    store.dispatch({
      type: 'FETCH_TRIGGER_SPEC',
      promise: api.client.triggerTypes.list()
        .catch((res) => {
          notification.error('Unable to retrieve trigger spec. See details in developer tools console.');
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });

    store.dispatch({
      type: 'FETCH_ACTION_SPEC',
      promise: api.client.actionOverview.list()
        .catch((res) => {
          notification.error('Unable to retrieve action spec. See details in developer tools console.');
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });
  }

  componentWillReceiveProps(nextProps) {
    let { ref: id } = nextProps.match.params;
    if (!id) {
      const { groups } = nextProps;
      id = groups.length > 0 && groups[0].rules.length > 0 ? groups[0].rules[0].ref : undefined;
    }
    if (id !== this.state.id) {
      this.setState({ id }, () => {
        if (id) {
          store.dispatch(flexActions.toggle(id.split('.')[0], false));
        }
      });
    }
  }

  fetchGroups() {
    const { notification } = this.props;

    return store.dispatch({
      type: 'FETCH_GROUPS',
      promise: api.client.ruleOverview.list()
        .catch((res) => {
          notification.error('Unable to retrieve rules. See details in developer tools console.');
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    })
      .then(() => {
        const { id } = this.urlParams;
        const { groups } = this.props;

        if (id && !groups.some(({ rules }) => rules.some(({ ref }) => ref === id))) {
          this.navigate({ id: false });
        }
      })
    ;
  }

  get urlParams() {
    const { id } = this.state;
    const { section } = this.props.match.params;

    return {
      id,
      section: section || 'general',
    };
  }

  navigate({ id, section } = {}) {
    const current = this.urlParams;

    if (typeof id === 'undefined') {
      if (this.props.match.params.ref) {
        id = current.id;
      }
    }
    if (!id) {
      id = undefined;
    }

    if (typeof section === 'undefined') {
      section = current.section;
    }
    if (section === 'general') {
      section = undefined;
    }

    const pathname = `/rules${id ? `/${id}${section ? `/${section}` : ''}` : ''}`;

    const { location } = this.props;
    if (location.pathname === pathname) {
      return;
    }

    const { history } = this.props;
    history.push(pathname);
  }

  handleSelect(id) {
    return this.navigate({ id });
  }

  handleToggleAll() {
    return store.dispatch(flexActions.toggleAll());
  }

  handleFilterChange(filter) {
    store.dispatch({
      type: 'SET_FILTER',
      filter,
    });
  }

  handleCreate(rule) {
    const { notification } = this.props;

    return store.dispatch({
      type: 'CREATE_RULE',
      promise: api.client.rules.create(rule)
        .then((rule) => {
          notification.success(`Rule "${rule.ref}" has been created successfully.`);

          this.navigate({
            id: rule.ref,
            section: 'general',
          });

          return rule;
        })
        .catch((res) => {
          notification.error('Unable to create rule. See details in developer tools console.');
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });
  }

  handleSave(rule) {
    const { notification } = this.props;

    return store.dispatch({
      type: 'EDIT_RULE',
      promise: api.client.rules.edit(rule.id, rule)
        .then((rule) => {
          notification.success(`Rule "${rule.ref}" has been saved successfully.`);

          if (this.props.match.params.ref === rule.ref) {
            this._refreshDetails && this._refreshDetails();
          }
          else {
            this.navigate({
              id: rule.ref,
              section: 'general',
            });
          }

          return rule;
        })
        .catch((res) => {
          notification.error(`Unable to save rule "${rule.ref}". See details in developer tools console.`);
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });
  }

  handleDelete(ref) {
    if (!window.confirm(`Do you really want to delete rule "${ref}"?`)) {
      return undefined;
    }

    const { notification } = this.props;

    return store.dispatch({
      type: 'DELETE_RULE',
      ref: ref,
      promise: api.client.rules.delete(ref)
        .then((res) => {
          notification.success(`Rule "${ref}" has been deleted successfully.`);

          this.navigate({ id: null });

          return res;
        })
        .catch((res) => {
          notification.error(`Unable to delete rule "${ref}". See details in developer tools console.`);
          console.error(res); // eslint-disable-line no-console
          throw res;
        }),
    });
  }

  handleCreatePopup() {
    const { history } = this.props;
    history.push('/rules/new');
  }

  render() {
    const { notification, groups, filter, triggerSpec, criteriaSpecs, actionSpec, packSpec, collapsed } = this.props;
    const { id, section } = this.urlParams;

    setTitle([ 'Rules' ]);

    return (
      <Panel data-test="rules_panel">
        <PanelView className="st2-rules">
          <ToolbarActions>
            <ToolbarButton>
              <i
                className="icon-plus"
                onClick={() => this.handleCreatePopup()}
                data-test="rule_create_button"
              />
            </ToolbarButton>
          </ToolbarActions>
          <Toolbar title="Rules">
            <ToggleButton collapsed={collapsed} onClick={() => this.handleToggleAll()} />
            <ToolbarSearch
              title="Filter"
              value={filter}
              onChange={({ target: { value }}) => this.handleFilterChange(value)}
            />
          </Toolbar>
          <Content>
            { groups.map(({ pack, rules }) => {
              const icon = api.client.packFile.route(`${pack}/icon.png`);

              return (
                <FlexTableWrapper key={pack} uid={pack} title={pack} icon={icon}>
                  { rules .map((rule) => (
                    <RulesFlexCard
                      key={rule.ref} rule={rule}
                      selected={id === rule.ref}
                      onClick={() => this.handleSelect(rule.ref)}
                    />
                  )) }
                </FlexTableWrapper>
              );
            }) }

            { groups.length > 0 ? null : (
              <ContentEmpty />
            ) }
          </Content>
        </PanelView>

        <RulesDetails
          notification={notification}
          ref={(ref) => this._details = ref}
          handleNavigate={(...args) => this.navigate(...args)}
          handleCreate={(...args) => this.handleCreate(...args)}
          handleSave={(...args) => this.handleSave(...args)}
          handleDelete={(...args) => this.handleDelete(...args)}
          provideRefresh={(fn) => this._refreshDetails = fn}

          id={id}
          section={section}

          triggerSpec={triggerSpec}
          criteriaSpecs={criteriaSpecs}
          actionSpec={actionSpec}
          packSpec={packSpec}
        />
      </Panel>
    );
  }
}
